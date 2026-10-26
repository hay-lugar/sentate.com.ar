# Auditoría de seguridad (run-1)

Método: adaptación del flujo de `cloudflare/security-audit-skill` (reconocimiento → cazadores por frontera → consolidación). **Solo lectura de código fuente** (sin sandbox del SO, sin ejecutar el objetivo, sin tocar producción). Fuente: `main` en `8cbd58f`. Perfil estándar acotado a: migraciones y pgTAP, `app/api`, auth, `proxy.ts`, `next.config.ts`, workflows.

## Cobertura (honesta)
- 6 unidades cazadas por agentes independientes: funciones DEFINER/admin, RPC con secreto y workers, reservas, RLS/storage/propiedad del dueño, capa auth/web, cadena de suministro y agotamiento de recursos.
- **No se siguió el flujo completo de la skill**: no hay `coverage-ledger.json` validado, ni crítico de cobertura, ni verificador independiente por hallazgo (se verificó a mano lo decisivo: `safeNext` con el parser `URL` de Node y la concesión de `tenant_reservation_settings` en la migración). Los demás hallazgos son lecturas de código no reproducidas.
- No cubierto: componentes de UI no listados, `npm audit`/CVE de dependencias (sin red), estado remoto (Auth del dashboard, ACL reales, variables de Vercel, secretos de GitHub).

## Hallazgos y estado
| # | Sev. | Hallazgo | Estado |
|---|---|---|---|
| 1 | Media | El correo del comensal lo escribe un anónimo y no se verifica: se puede usar la plataforma para mandar avisos a terceros | **Mitigado** (tope de 6 avisos/día por dirección). Falta doble confirmación (decisión de producto) |
| 2 | Media | Inundación de `request_reservation` por RPC directo: el presupuesto por IP vive solo en la server action; se puede saturar el cupo de 30/10 min de un local o retener capacidad | **Abierto**: requiere un token firmado por el servidor o captcha |
| 3 | Baja | Local rechazado en moderación seguía recibiendo solicitudes | **Corregido** (trigger) |
| 4 | Baja | `safeNext` dejaba pasar `/\t/evil.com` (open redirect post-login; el parser lo resuelve a `//evil.com`) | **Corregido** (rechaza caracteres de control) + test. Que Next emita la tab sin codificar no se verificó |
| 5 | Baja | Cualquier cuenta logueada leía capacidad y reglas de retención de otros locales (`tenant_reservation_settings`) | **Corregido** (grant por columnas + RPC `get_reservation_settings` para miembros) |
| 6 | Baja | Un local aprobado podía mover el pin en pasos de ≤200 m sin revisión; provincia/localidad/barrio no disparaban revisión | **Parcial**: localidad/provincia/barrio ya devuelven a revisión; falta anclar el pin a la posición aprobada |
| 7 | Baja | Logos/fotos aceptan cualquier `https://` (rastreo de comensales por host externo; CSP solo reporta) | **Abierto** |
| 8 | Baja | `create_tenant` sin tope por usuario; slug liberado se puede reclamar (QR impreso) | **Abierto** |
| 9 | A validar | `explore_search` anónimo recalcula similitud sobre todos los platos; sin límite en la base | **Abierto**; medir con `EXPLAIN ANALYZE` sobre datos reales |

### Endurecimiento sugerido (no son hallazgos)
- CSP en solo reporte con `unsafe-inline`: pasar a enforce (paso 25 del plan).
- Fijar acciones de GitHub por SHA; fijar `npm@11`.
- `x-forwarded-for` como respaldo del límite de `/api/explorar` (solo seguro detrás de Vercel); límite en memoria por instancia.
- RPC con secreto (`claim_notifications`, `complete_notification`, `record_payment_event`): sin contador de intentos fallidos; la fortaleza depende de que el secreto sea largo y aleatorio.
- Webhook de Mercado Pago: `kind`/`action` del cuerpo no están firmados pero entran en `event_key`; leer solo `data.id` de la URL.
- `admin_remove_admin`: la verificación de «último admin» sin bloqueo puede dejar cero admins con dos bajas concurrentes.
- `delete_my_account` sin reautenticación; datos del comensal quedan en reservas al borrar la cuenta.
- `private.rate_limit_hits` crece sin tope con claves aleatorias.

### Verificaciones para quien opera (no son comprobables desde el código)
1. Dashboard → API → *Exposed schemas*: `private` no debe estar.
2. `select n.nspname, p.proname, p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and (p.proacl is null or p.proacl::text like '%=X/%')` y revisar.
3. `private.settings`: los hashes de secretos están cargados y provienen de valores ≥32 caracteres aleatorios.
4. `private.platform_admins` contiene solo a quienes corresponde (y nunca corrió `seed.sql` en producción).
5. `show statement_timeout` para el rol `anon`; reglas de rate limit en Vercel Firewall para `/api/explorar`.
