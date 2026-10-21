# Validación integral — Explorador, reservas con capacidad y gestión

Estado **honesto** por requisito. «Verificado» = cubierto por pruebas que corren en la CI (stack local de Supabase: pgTAP, Data API
real, Realtime y E2E con Chromium). «Sin verificar» = existe el código pero no se pudo probar acá. Capturas en `docs/capturas/`
(generadas por `tests/e2e-live/capturas.spec.ts`; la CI también las sube como artefacto).

## Etapas
| Etapa | Contenido | PR |
|---|---|---|
| A | Rol de plataforma, moderación, suspensión, visibilidad, auditoría | #19 |
| B | Perfil geográfico (PostGIS), catálogos, ubicación confirmada, aprobación | #20 |
| C | Explorador, búsqueda, filtros, mapa, cercanía | #21 |
| D | Cuenta del comensal, favoritos, historial, cancelación, Google/Apple | #22 |
| E | Capacidad real, ocupación solapada, concurrencia | #23 |
| F | Etiquetas dietarias, cambio masivo de precios, panel de reservas | #24 |
| G | Superadministración, suscripciones manuales, destacados, validación | #25 |

## Requisitos
| Requisito | Estado | Evidencia / nota |
|---|---|---|
| Explorador `/explorar` sin romper slugs publicados | **Verificado** | E2E `explorar.spec`; slugs reservados en la base |
| Listado solo con perfil completo + ubicación confirmada + aprobado + publicado + acceso vigente | **Verificado** | pgTAP 150/160/170/190; una sola regla `private.is_listed` |
| Moderación / publicación / suscripción / suspensión como ejes separados | **Verificado** | pgTAP 150, 210 |
| Borradores, rechazados y suspendidos fuera de mapa, lista, búsqueda y destacados | **Verificado** | pgTAP 170/210; E2E `superadmin.spec` (suspender oculta carta y explorador) |
| Sin fuga por otros endpoints; contrato de campos fijo | **Verificado** | E2E: claves exactas de la respuesta; RLS por columna en `tenant_locations` |
| Mapa MapLibre + OpenFreeMap, clusters, selección, «Buscar en esta zona», lista si el mapa falla | **Verificado** (mapa real renderizado en CI) | capturas `explorar-mapa-*`; E2E con el proveedor bloqueado (`explorar-sin-mapa`) |
| Geolocalización explícita, aproximada, no guardada, fuera de la URL; alternativa si se deniega | **Verificado** con permiso simulado | E2E `explorar.spec`. **Sin verificar** en un dispositivo físico |
| Búsqueda con tolerancia a tildes/errores, plato, localidad, tipo, cocina; interpretación como filtros visibles; ambigüedad preguntada | **Verificado** | pgTAP 170, unit del parser, E2E |
| Filtros: localidad, tipo, cocina, precio declarado, abierto ahora (zona, medianoche, cierres), distancia | **Verificado** | pgTAP 170 |
| «Cocina abierta» y «acepta reservas» como filtros | **No implementado a propósito** | habrían coincidido con todo (sin dato propio) |
| URL compartible, atrás/adelante, cancelación y orden de respuestas, paginación estable | **Verificado** | E2E; hook `useRemoteSearch` |
| Carta HTML con etiquetas Vegano / Vegetariano / Apto celíacos como declaración del local, sin inferir al comercio | **Verificado** | E2E `carta-avanzada` |
| Google y Apple | **Código listo, sin verificar con un proveedor real** | requieren credenciales (Apple: USD 99/año); ver `docs/auth-oauth.md`. Un proveedor no habilitado no aparece (E2E) |
| Historial, estados, favoritos privados, cancelación según reglas del comercio, baja de cuenta | **Verificado** | pgTAP 180, E2E `cuenta.spec` |
| Reservas de invitado siguen igual; sin reclamar por teléfono/email; reclamo verificable | **Verificado / fuera de alcance (reclamo)** | documentado |
| Disponibilidad real en la base, capacidad, ocupación solapada, retención, vencimiento, revalidación | **Verificado** | pgTAP 190 |
| Concurrencia sin sobreventa, idempotencia, liberación | **Verificado** | `capacity-concurrency.test.mjs` contra la Data API real |
| Panel: carta, categorías, fotos, pausar, precios masivos con vista previa, todo o nada, conflictos | **Verificado** | pgTAP 200, E2E |
| Panel: reservas en vivo, aceptar/rechazar/cancelar/finalizar, sonido opcional, aviso accesible | **Verificado** (sonido: solo el control) | E2E; Realtime ya cubierto |
| Perfil público editable (nombre, info, portada/logo, dirección + pin, redes, teléfonos, cocina, horarios) | **Verificado** | repartido entre *Ajustes* y *Mapa* |
| Tablero Kanban de reservas | **No implementado** | lista con filtros por estado |
| Superadmin: módulo protegido en servidor y en base, bandeja, aprobar/rechazar/corregir con motivo, suspender/reactivar, auditoría | **Verificado** | pgTAP 210, E2E `superadmin.spec` |
| Escalada de privilegios (autoasignación, `user_metadata`, dueño→admin) | **Verificado** | pgTAP 150/210 |
| Suscripción manual (prueba, activar, mora, cancelar), el comercio no puede editarla | **Verificado** | pgTAP 210. Sin integración de cobro (no se simuló) |
| Destacados: apagado por defecto, ventana y auditoría, bloque aparte con etiqueta, respeta filtros/visibilidad | **Verificado** | pgTAP 210, E2E |
| RLS en todas las tablas; sin vistas ni funciones privilegiadas expuestas | **Verificado** | pgTAP 010 (y consultado en el remoto) |
| Imágenes: Storage privado, validación y optimización existentes | **Verificado** (etapas previas) | miniaturas dedicadas para mapa/tarjetas: **no** (se usa la portada optimizada) |
| Mobile-first 360/390/768/1440, sin desborde, a11y | **Verificado** en las pantallas probadas | axe (WCAG A/AA, sin color-contraste) + desborde en E2E; capturas |
| Contraste AA completo, zoom 200 %, teclado en el mapa | **Sin verificar de forma sistemática** | la lista es la alternativa accesible al mapa |
| Regresión de cartas, panel y QR existentes | **Verificado** | suites previas siguen en verde |

## Base remota
Aplicadas A–F (y G al integrarse) con autorización explícita; el proyecto remoto estaba vacío (0 comercios, usuarios y reservas), sin seed. No hay comercios
ficticios en el directorio remoto: los fixtures (`supabase/seed.sql`) son solo para local/CI.

## Para operar
Variables y proveedores: `.env.example`, `docs/explorador-diseno.md` (OpenFreeMap, Geoapify), `docs/auth-oauth.md`, `docs/superadmin.md`
(alta del superadministrador). Pendiente del lado del dueño del proyecto: configurar Google/Apple, `GEOAPIFY_API_KEY` (opcional), URLs de redirección de
Auth y dar de alta al primer superadmin.
