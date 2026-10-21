# Explorador, reservas con capacidad y gestión — decisiones de diseño

Documento vivo. Cada etapa lo actualiza con lo realmente implementado y verificado.

## Etapas

| Etapa | Contenido | Estado |
|---|---|---|
| A | Rol de plataforma, moderación, suspensión, visibilidad, auditoría | Integrada en main |
| B | Perfil geográfico (PostGIS), catálogos, aprobación | Integrada en main |
| C | `/explorar`, búsqueda, filtros, mapa | Integrada en main |
| D | Perfil del comensal, favoritos, historial, OAuth | Integrada en main |
| E | Capacidad y reservas con disponibilidad real | Integrada en main |
| F | Carta avanzada y administración del comercio | En curso |
| G | Superadmin completo, validación integral | Pendiente |

## Cuatro ejes independientes

- **Moderación** (`tenant_moderation.status`): draft → pending_review → approved | rejected | changes_requested. La decide un superadministrador.
- **Publicación** (`tenants.is_published`): la decide el dueño.
- **Suscripción** (`tenant_subscriptions`): el acceso operativo se calcula con `now()`.
- **Suspensión administrativa** (`tenants.status = 'suspended'` + motivo): solo superadmin.

## Regla de visibilidad (una sola, en la base)

| Situación | Carta `/[slug]` | Explorador |
|---|---|---|
| Borrador / en revisión / correcciones, publicado | visible | no |
| Aprobado + publicado + acceso vigente (+ ubicación confirmada, etapa B) | visible | sí |
| Rechazado | oculta | no |
| Suspendido | oculta | no |
| Despublicado por el dueño | oculta | no |
| Prueba vencida | según `private.settings.public_menu_when_access_lapsed` (hoy `visible`) | **no** (siempre) |

`private.is_publicly_visible` rige la carta y `private.is_listed` el explorador; ningún endpoint decide por su cuenta.

## Cambios posteriores

Un cambio de nombre o dirección de un comercio aprobado lo devuelve a `pending_review` (trigger). Sale del explorador, pero la carta y las reservas existentes no se interrumpen.

## Superadministrador

- Tabla `private.platform_admins`, sin grants ni políticas: nadie se autoasigna; `user_metadata` nunca se lee.
- Alta inicial (solo con acceso directo a la base, p. ej. SQL editor del proyecto):
  `insert into private.platform_admins (user_id) select id from auth.users where email = '<correo>';`
- Cada operación valida en la base (`private.is_platform_admin()`), nadie modera su propio comercio y todo queda en `private.admin_audit_log`.

## Proveedores (investigados)

- Teselas: OpenFreeMap (gratis, uso comercial permitido, sin clave, sin SLA, atribución obligatoria). Nunca `tile.openstreetmap.org`.
- Geocodificación: Geoapify plan gratuito (3000 créditos/día, 5 req/s, atribución). Solo se guardan coordenadas confirmadas por el dueño.
- Mapa: MapLibre GL JS, carga dinámica solo en `/explorar` y en el editor de ubicación; la lista funciona sin mapa.
- Extensiones disponibles en el proyecto remoto: postgis, unaccent, pg_trgm, btree_gist, pg_cron.

## Política de capacidad (etapa E, decisión)

Una solicitud pendiente **retiene** cupo hasta que el comercio responde o vence (expiración configurable, por defecto 2 h); se libera al rechazar, cancelar o vencer. Las validaciones y escrituras ocurren en una transacción con bloqueo por comercio/fecha.

## Etapa B — perfil geográfico (implementado)

- `tenant_locations`: lat/lng (cota Argentina), `geog` generada con índice GiST, provincia, localidad (+ clave normalizada sin tildes), barrio y `confirmed_at`. Solo se escribe por `save_explorer_profile` (atómica: tipo, cocinas, enlaces, dirección y pin). Mover el pin sin confirmar deja la ubicación sin confirmar; moverlo más de 200 m en un comercio aprobado lo devuelve a revisión.
- Catálogos de referencia: `provinces` (24), `business_types`, `cuisines` (máx. 3 por comercio). No hay catálogo de localidades: el filtro por localidad (etapa C) sale de las ubicaciones confirmadas de comercios listados.
- Requisitos para enviar a revisión (`private.profile_missing`): tipo de comercio, dirección, teléfono del local, al menos un turno y ubicación confirmada. `private.is_listed` exige además tipo y ubicación confirmada.
- Contrato público de `tenant_locations`: sin `confirmed_by`; visible solo para comercios listados (o para sus miembros).
- Panel: «Mapa» (`/admin/[slug]/explorador`) con estado de moderación visible para el dueño, faltantes, editor con pin (MapLibre, carga dinámica solo ahí), coordenadas manuales como alternativa accesible y «Solicitar aprobación».
- Geocodificación opcional (`/api/geocode`, Geoapify): requiere `GEOAPIFY_API_KEY` y sesión; no guarda resultados; sin clave se oculta.
- Teselas: `NEXT_PUBLIC_MAP_STYLE_URL` (por defecto OpenFreeMap Positron). Sin SLA: si no cargan, el formulario sigue usable con coordenadas escritas.

## Etapa C — explorador, búsqueda y filtros (implementado)

**Rutas:** `/explorar` (página), `POST /api/explorar` (búsqueda), RPC `public.explore_search(jsonb)` y `public.explore_facets()`. Las cartas `/[slug]` no cambian; `?mesa=1` abre el pedido de mesa (lo usa la tarjeta «Pedir mesa»).

**Una sola regla de visibilidad:** ambas RPC son SECURITY INVOKER (corren con RLS del visitante) y filtran con `private.is_listed`, la misma que usan las políticas de `tenant_locations` y `tenant_cuisines`. Un comercio no listado no aparece en lista, mapa, búsqueda ni facetas, ni siquiera buscándolo por nombre. El contrato de salida es fijo: id, slug, nombre, descripción corta, tipo, cocinas, rango de precio, portada/logo, lat/lng confirmadas, localidad/barrio, abierto ahora y distancia aproximada. Nunca reservas, datos personales ni suscripción.

**Fin de la prueba:** la carta sigue la política `private.settings.public_menu_when_access_lapsed` (hoy `visible`); el explorador **siempre** retira al comercio al vencer el acceso operativo (no promocionamos locales que ya no operan).

**Búsqueda:** texto normalizado (sin tildes/mayúsculas) con `pg_trgm` (`word_similarity`, umbral 0.4, tolera errores de tipeo) sobre nombre, localidad, barrio, tipo, cocinas y platos disponibles de categorías visibles. Índices GIN trigram sobre nombre de comercio y de plato. Orden: relevancia, distancia (solo con ubicación) o nombre; paginación estable (desempate por nombre e id).

**Interpretación sin LLM** (`lib/explorer/parse-query.ts`): reconoce localidades, tipos y cocinas del directorio, «abierto ahora» y «cerca de mí», y los convierte en chips visibles y editables. Lo ambiguo (p. ej. «parrilla» es tipo y cocina; una localidad homónima en dos provincias) no se aplica: se le pregunta a la persona. El resto queda como texto libre.

**Filtros:** localidad, tipo, cocina, precio declarado ($/$$/$$$), abierto ahora (zona horaria del comercio, turnos por día, cruce de medianoche y cierres excepcionales: `private.is_open_now`), distancia máxima y «Buscar en esta zona».
- *No implementados a propósito:* «cocina abierta» y «acepta reservas». Hoy no existe el dato (se agrega con la configuración de capacidad de la etapa E); mostrar un filtro que coincide con todo sería decorativo.
- El precio es la categoría declarada, no un monto por persona.

**Estado en la URL:** `q, loc, tipo, cocina, precio, abierto, cerca, radio, orden, vista, pagina`. Atrás/adelante funcionan y se conserva al volver de una carta. Cada petición cancela la anterior y la respuesta tardía de una vieja se descarta.

**Ubicación del visitante:** solo por acción explícita («Usar mi ubicación»), con el motivo explicado antes; no se insiste si se deniega (alternativa: elegir localidad). Se redondea a ~100 m, viaja en el cuerpo de un POST (no en URL), no se guarda ni se registra, y nunca aparece en la URL compartida (solo `cerca=1`). `Permissions-Policy` pasó de `geolocation=()` a `geolocation=(self)`. La ubicación de los comercios es siempre la confirmada por el dueño.

**Mapa:** MapLibre GL JS (carga dinámica solo en `/explorar` y en el editor del panel), clusters nativos, selección sincronizada con la lista, marcadores por zona visible (máximo 300, con aviso si hay más), sin reencuadre automático salvo el primero. Si falla WebGL o el proveedor, la lista sigue con los mismos filtros.
- Teselas: OpenFreeMap (sin clave, uso comercial permitido, **sin SLA**, atribución visible en el mapa). `NEXT_PUBLIC_MAP_STYLE_URL` permite cambiar de proveedor sin tocar código.
- Costo: $0. Riesgo: sin garantías de disponibilidad (mitigado por el fallback a lista).

**Límites:** `/api/explorar` acota ritmo por conexión (best-effort por instancia, 90/min), tamaño de texto (80), listas (≤10), `limit` (≤300) y `offset` (≤10 000); la base valida de nuevo. Respuestas `no-store` (dependen de la hora por «abierto ahora»).

**Pendiente de verificación manual:** el mapa con teselas reales y la geolocalización en un dispositivo físico (el CI corre en un Chromium sin GPU: allí el mapa puede degradar al fallback de lista).

## Etapa D — cuenta del comensal (implementado)

Detalle y requisitos externos en `docs/auth-oauth.md`.

- **Rutas:** `/cuenta` (perfil y baja), `/cuenta/reservas` y `/cuenta/reservas/[id]` (historial, detalle y cancelación), `/cuenta/favoritos`. Todas exigen sesión, llevan `noindex` y están en `robots.txt`.
- **Base:** `reservations.user_id` (lo asigna un trigger con `auth.uid()`; no es columna escribible), `diner_profiles` y `favorites` con RLS «solo lo propio», y RPC `my_reservations`, `cancel_my_reservation`, `set_favorite`, `my_favorites`, `delete_my_account` (impl SECURITY DEFINER en `private` + wrapper INVOKER). Ver una reserva ajena o inexistente responde igual (`not_found`); los ids son UUID.
- **Favoritos:** solo de comercios visibles; los que dejan de serlo salen de la lista sin borrar el vínculo; máximo 100; el corazón también está en las tarjetas del explorador (sin sesión lleva al ingreso y vuelve).
- **Ingreso:** Google y Apple por Supabase Auth, visibles solo si el proveedor está habilitado.
- **No incluido (honesto):** corazón dentro de la carta pública, reclamar solicitudes de invitado, y pantalla del comercio para el plazo de cancelación (hoy `diner_cancel_cutoff_hours` por SQL).

## Etapa E — capacidad y reservas con disponibilidad real (implementado)

**Modelo.** `tenant_reservation_settings` (capacidad de comensales simultáneos —null = sin tope, que es el comportamiento previo—, máximo por pedido, intervalo 15/30/60, duración de ocupación, anticipación mínima, corte de cocina, retención de pendientes) y `tenant_reservation_blocks` (bloqueos por horario). Cada reserva guarda `ends_at` (ocupación) y `hold_expires_at` (retención) **al crearse**: cambiar la configuración después no modifica ni cancela reservas existentes; solo afecta a los pedidos nuevos.

**Política (decidida y visible en el panel).**
- Capacidad = personas simultáneas; **no se promete una mesa física**.
- La ocupación se evalúa por **solapamiento** de intervalos (no solo por igualdad de hora de inicio): la carga máxima se mide al inicio de la ventana y en cada inicio de otra reserva dentro de ella.
- Una solicitud **pendiente retiene cupo** hasta que se responde o vence (`min(creación + pending_hold_minutes, inicio)`, 4 h por defecto). Rechazar, cancelar o vencer libera el cupo al instante.
- El vencimiento se **calcula al leer** (`hold_expires_at > now()`), sin depender de ningún cron; además se marca `expired` de forma perezosa al pedir una reserva o abrir el panel. Si un programador se atrasa, el cupo igual se libera.
- Confirmar una solicitud cuya retención ya venció se **revalida** como pedido nuevo (`capacity_exceeded` si otro tomó el lugar). Confirmar una retención vigente no falla: su cupo ya estaba contado, aunque se haya bajado la capacidad después.
- Estados nuevos: `expired` (solo lo marca el sistema) y `finished` (el dueño finaliza una reserva cuyo horario ya empezó).

**Concurrencia.** `request_reservation` valida el horario, calcula la capacidad y escribe **en una sola transacción bajo un bloqueo (advisory) por comercio**; la confirmación de una retención vencida toma el mismo bloqueo. La idempotencia por clave sigue funcionando. La consulta `reservation_availability` desde el navegador es **informativa**; la escritura vuelve a validar. Prueba: `supabase/tests/api/capacity-concurrency.test.mjs` dispara ráfagas paralelas contra la Data API real (12 pedidos de 2 personas con tope 10 → entran exactamente 5; ocupación solapada; misma clave en paralelo → una sola reserva; liberar al rechazar).

**Interfaz.** La carta consulta el cupo real por día y cantidad de personas (los horarios completos/bloqueados se deshabilitan y se explican); el máximo por pedido sale de la configuración. El panel tiene `/admin/[slug]/reservas/capacidad` (cupo, retención, bloqueos). Limitación conocida: la grilla de horarios de la carta sigue siendo la de 30 minutos; con intervalo de 60 los horarios intermedios aparecen como «no disponible», y el panel ofrece solo 30 o 60.

## Etapa F — carta avanzada y administración del comercio (implementado)

- **Etiquetas dietarias** por plato: *Vegano* (`vegan`), *Vegetariano* (`veggie`) y *Apto celíacos* (`sin-tacc`). Las **declara el local; no son una certificación** ni se infieren, y nunca clasifican al comercio entero (el explorador no usa estas etiquetas). El aviso se muestra en el detalle del plato, al filtrar y en el formulario del dueño. La carta (HTML, no PDF) ofrece un filtro dietario solo si hay platos con esas etiquetas.
- **Cambio masivo de precios** (`/admin/[slug]/menu/precios`, solo datos reales): selección explícita (por plato o categoría), tipo (% / monto / precio fijo), redondeo, **vista previa** fila por fila, validación (no negativos, tope, máximo 500), **confirmación** y aplicación **atómica** con `bulk_update_prices`: todo o nada, aislada por comercio (los ids de otro comercio cuentan como inexistentes), con control de versión por plato (`updated_at`): si algo cambió mientras se editaba, no se aplica nada y se listan los platos en conflicto. Con prueba vencida no se puede editar.
- **Reservas en el panel:** estados `Vencida` y `Finalizada`, botones *Cancelar* (confirmada) y *Finalizar* (desde la hora de inicio), con aplicación optimista y reversión si la base rechaza (el estado no se anuncia como hecho hasta que la base lo confirma). **Sonido de solicitudes nuevas opcional**: apagado por defecto, lo activa la persona, suena solo ante una solicitud nueva en vivo (no al cargar ni al resincronizar); el aviso visual/lector de pantalla sigue siendo el toast `aria-live`.
- **Perfil público:** nombre/descripción/teléfono del local/horarios/colores/logo y portada en *Ajustes*; tipo, cocinas, dirección, pin y redes en *Mapa* (etapa B). El teléfono de la cuenta nunca se publica.
- **Pendiente / no incluido:** miniaturas dedicadas para tarjetas y mapa (hoy se usa la portada optimizada por `next/image`), arrastrar para reordenar platos y reservas en Kanban.
