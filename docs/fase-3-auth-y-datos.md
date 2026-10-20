# Fase 3 · Autenticación y datos reales

Conecta el frontend a Supabase: login del dueño, alta del local, carta pública y panel leídos de la base,
solicitudes de reserva reales y CRUD del panel con RLS. Las demos (`/el-bodegon`, `/la-esquina`, `/sakura`)
siguen funcionando igual, con datos locales.

## 1. Resolución demo / real

`lib/data/resolve.ts` → `resolvePublicTenant(slug)`:

1. Si existe un comercio **publicado** en Supabase con ese slug → `source: "live"` (lectura con la clave
   publicable; RLS solo expone comercios publicados y platos disponibles).
2. Si no, y el slug es una demo → fixture local, `source: "demo"`.
3. Si no → 404.

Los slugs de demo están reservados en la base (`private.is_reserved_demo_slug`): `create_tenant` devuelve
`slug_taken` y un `UPDATE` de slug a uno de demo falla con `23505`. Así un comercio real nunca "pisa" una demo.

En modo live la UI no muestra insignias ni pie de "demo", y el botón final dice "Enviar solicitud".

## 2. Autenticación

- `@supabase/ssr` con cookies; `proxy.ts` refresca la sesión en cada request.
- La identidad en el servidor se lee con `supabase.auth.getClaims()` (verifica el JWT), nunca con
  `getSession()` ni con `user_metadata`.
- Rutas: `/login`, `/registro`, `/registro/local` (alta del comercio vía RPC `create_tenant`),
  `/auth/callback` (intercambio de código del email de confirmación), `/admin` (redirige al primer
  comercio del usuario, al alta o al login).
- `safeNext()` solo acepta rutas relativas propias (sin open redirect).

### Configuración necesaria en el proyecto remoto

- **Auth → URL Configuration**: Site URL = dominio de producción; Redirect URLs incluye
  `https://<dominio>/auth/callback` (y `http://localhost:3000/auth/callback` para desarrollo).
- Si "Confirm email" está activo, el registro muestra "Revisá tu email" y el alta del local sigue al volver
  por `/auth/callback?next=/registro/local`.

## 3. Panel real

- `app/admin/[slug]/layout.tsx` carga `getLiveTenantRecord(slug)` con la sesión del dueño. Sin sesión →
  login; sin membresía → 404 (no revela si el comercio existe).
- Estado de acceso desde la base (`public.get_tenant_access`, misma regla que las políticas). Con la prueba
  vencida la cuenta sigue accesible, pero se muestra `AccessExpired` y toda escritura falla por RLS.
- Mutaciones: Server Action `mutateTenantAction(tenantId, action)`. El `tenantId` solo identifica filas;
  la autorización la decide RLS (`can_operate`). Nunca se usa `service_role`.
  - Con RLS, un UPDATE/DELETE sin permiso afecta 0 filas sin error: se trata como "sin permiso".
  - El cliente aplica el cambio de forma optimista y luego `router.refresh()`; ante error, revierte con
    el registro del servidor.
- Horarios (reemplazado en Fase 3.1 por `save_tenant_settings` con horarios por día; ver `fase-3.1-estabilizacion.md`): `public.replace_tenant_schedule` (SECURITY INVOKER, todo o nada). El panel modela "mismos turnos
  todos los días abiertos"; si la base tiene horarios distintos por día, se muestran los del primer día.
- Publicar/despublicar la carta: tarjeta en el inicio del panel (`setPublishedAction`).

## 4. Solicitudes de reserva

- Server Action `requestReservationAction` → RPC `request_reservation`. La validación de forma se hace en la
  acción. Las reglas de negocio (horario, anticipación, ventana, cierre, comercio activo) las aplica la base.
- La clave de idempotencia se genera por borrador (si el payload cambia, cambia la clave). Un doble envío
  devuelve la misma solicitud (`replayed: true`).
- Los errores de negocio se mapean a mensajes y al paso del formulario que corresponde
  (`lib/reservation/errors.ts`).
- Límites antiabuso en la base (migración 07), que aplican aunque se llame la RPC directo:
  - `too_many_pending`: máximo 3 solicitudes pendientes futuras por teléfono y comercio.
  - `rate_limited`: máximo 30 solicitudes nuevas por comercio cada 10 minutos.
- En la vista live, el resultado dice "Solicitud enviada… Todavía no es una reserva confirmada".

## 5. Verificación (local, 2026-10-20)

| Chequeo | Resultado |
| --- | --- |
| pgTAP (`npm run test:db`) | 130/130 (11 nuevas en `100_phase3_limits_schedule.sql`) |
| Data API (`node --test supabase/tests/api/data-api.test.mjs`) | 10/10 |
| `supabase db advisors` / `db lint` | limpios |
| typecheck + lint | limpios |
| Vitest | 84/84 |
| `next build` | OK |
| E2E demo (`npm run test:e2e`) | 26/26 |
| E2E live (`npm run test:e2e:live`, contra Supabase local) | 12/12 |

Las E2E live cubren: carta real sin marcas de demo, solicitud real → `pending` → visible en el panel, login
inválido, confirmar una solicitud y persistencia, alta de plato reflejada en la carta pública, ajustes
persistidos, aislamiento entre dueños, prueba vencida, cerrar sesión, registro completo con prueba de 30
días y rechazo de slugs de demo.

## 6. Aplicación remota de la migración 07

En el proyecto `Sentate` (`nemeftbwnxymjdqinjtj`), `apply_migration` se cortó dos veces por timeout de la
integración (sin bloqueos en la base y sin cambios aplicados). Se aplicó por partes con `execute_sql`:

- ✅ `private.is_reserved_demo_slug`, `private.tenants_validate`, `private.create_tenant_impl`,
  `private.request_reservation_impl`, índice `reservations_tenant_created_idx`, `public.get_tenant_access`.
- ✅ `public.replace_tenant_schedule`: el bloque contiene un `DELETE` y la integración pide confirmación para
  sentencias destructivas, que vencía por timeout. Se aplicó desde el SQL Editor del dashboard. Verificado: cuerpo
  idéntico al del archivo (md5 del `prosrc`), `SECURITY INVOKER`, `search_path` vacío, `EXECUTE` solo para
  `authenticated` (anon → `42501`).
- Versión `20261020000700` registrada en `supabase_migrations.schema_migrations`.

Advisors remotos después de aplicar: solo `INFO` (tablas privadas deny-all e índices sin uso en base vacía).

## 7. Pendientes y límites conocidos

- **Rate limiting por IP**: no está implementado; corresponde al borde (WAF/Vercel Firewall o middleware con
  store compartido). La base limita por comercio y por teléfono.
- **Logos**: no hay Storage todavía; en cuentas reales solo se aceptan URLs `https://`.
- **Estados**: `cancelled` (de la base) se muestra como "rechazada" en el panel.
- **Horarios por día**: el panel edita horarios uniformes (ver §3).
- **Métricas de visitas**: no existen todavía; el panel lo indica.
- **Carta al vencer la prueba**: sigue `visible` (decisión de producto pendiente, ver Fase 2 §5).
- Pagos y WhatsApp: fuera de alcance.
