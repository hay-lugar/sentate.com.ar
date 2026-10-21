# Explorador, reservas con capacidad y gestión — decisiones de diseño

Documento vivo. Cada etapa lo actualiza con lo realmente implementado y verificado.

## Etapas

| Etapa | Contenido | Estado |
|---|---|---|
| A | Rol de plataforma, moderación, suspensión, visibilidad, auditoría | Integrada en main |
| B | Perfil geográfico (PostGIS), catálogos, aprobación | En curso |
| C | `/explorar`, búsqueda, filtros, mapa | Pendiente |
| D | Perfil del comensal, favoritos, historial, OAuth | Pendiente |
| E | Capacidad y reservas con disponibilidad real | Pendiente |
| F | Carta avanzada y administración del comercio | Pendiente |
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
