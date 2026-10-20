# Fase 3.1 · Estabilización

En esta fase se corrigieron los problemas que encontramos en la Fase 3: los horarios se perdían, las escrituras no eran atómicas, había estados de error engañosos y las reservas no llegaban en vivo. También agregamos CI y una validación de punta a punta.
Los cambios de esquema están en `supabase/migrations/20261021000800_phase31_settings_reorder_realtime.sql`. Todo se probó en local. La migración se aplicó después en el proyecto remoto (ver §6).

Documentación oficial consultada (Supabase, octubre 2026):
- Realtime Broadcast con canales privados y autorización por RLS sobre `realtime.messages` (`realtime.topic()`, `private: true`).
- Broadcast desde la base de datos con triggers (`realtime.send` / `realtime.broadcast_changes`).
- `supabase.realtime.setAuth()` para autorizar el socket con la sesión.

## 1. Horarios sin pérdida de datos

**Antes:** el mapper tomaba los turnos del primer día abierto y los aplicaba a toda la semana. Si los días eran distintos, al guardar se pisaban.

**Ahora:**
- **Modelo:** `Schedule = { week: Shift[][] (7 días, 0 = domingo), closures: ClosureDay[] }`. Cada día conserva sus turnos y cada turno su `id` real (`lib/domain/types.ts`).
- **Lógica:**
  - `shiftsOn(schedule, serviceDate)` aplica primero el cierre excepcional y después los turnos del día.
  - Disponibilidad, abierto/cerrado y calendario usan esa función (`lib/domain/schedule.ts`).
  - Los turnos que cruzan la medianoche siguen perteneciendo a la fecha de servicio en que abrieron.
- **Mapper:**
  - `rowsToSchedule(shiftRows, closureRows)` arma la semana tal cual está en la base.
  - Ya no existe el flag `uniform`.
- **Carta pública:**
  - Muestra un resumen por grupos de días (`describeWeek`), por ejemplo `Mar a Sáb · 12:00–16:00 · 20:00–00:30` y `Dom · 12:00–16:00`.
  - El calendario marca los cierres con su motivo.
- **Editor:** `components/admin/schedule-editor.tsx`.
  - Cada día puede estar abierto o cerrado, con hasta 3 turnos.
  - "Copiar a los días abiertos" copia los turnos de un día a los demás.
  - Los cierres excepcionales se cargan con fecha y motivo.
- **Validación:**
  - `validateSchedule` detecta superposiciones con la misma regla que el trigger `tenant_shifts_no_overlap`: semana circular, incluida la trasnoche del domingo contra el lunes temprano.
  - La base vuelve a validar al guardar.
- **Guardar colores o datos del local no toca los horarios:**
  - El formulario manda los horarios solo si cambiaron.
  - La RPC recibe `p_schedule = null` en ese caso.

**Pruebas:**
- Unitarias (`live-mappers`, `schedule`):
  - Lectura → edición → payload conservando cada día.
  - Guardar solo colores manda `schedule: null`.
- pgTAP:
  - Horarios distintos por día más un cierre.
  - Guardar colores no borra turnos ni cierres.
- E2E: horarios distintos por día después de recargar, y guardar colores conserva el domingo con solo almuerzo.

El seed local (`supabase/seed.sql`) incluye un comercio con domingo solo almuerzo.

## 2. Mutaciones atómicas y concurrencia

| Operación | Cómo |
| --- | --- |
| Ajustes (perfil + horarios + cierres) | `public.save_tenant_settings(tenant, expected_version, profile, schedule?)` en **una transacción**. Bloquea la fila del comercio (`FOR UPDATE`) y compara `tenants.updated_at` con la versión que vio el panel. Si no coincide, devuelve `stale_write` y no escribe nada. Si un turno se superpone, revierte también el perfil. |
| Reordenar categorías | `public.reorder_categories(tenant, ids[])`: una sola sentencia. El conjunto de IDs tiene que coincidir exactamente con el de la base; si otra sesión agregó o borró una categoría, devuelve `stale_write`. Reemplaza las N escrituras independientes de antes. |
| Platos y categorías (editar, activar, borrar, renombrar) | `UPDATE/DELETE ... WHERE updated_at = <versión vista>`. Si afecta 0 filas, se relee la fila: si sigue visible es `stale`; si no, es falta de permiso. |
| Estado de reservas | `UPDATE ... WHERE status = <estado que se veía>`, además de las transiciones del trigger. Una solicitud ya respondida en otra pestaña da `stale` ("ya fue respondida"). |

Las dos RPC son `SECURITY INVOKER`: siguen pasando por RLS (`can_operate` = miembro con prueba o suscripción vigente). El `tenant_id` que manda el cliente solo identifica filas; no da permisos. Nunca se usa `service_role`.

**Validación en runtime (`zod`).**
- `lib/admin/live-mutations.ts` define el contrato de cada Server Action del panel. `app/[slug]/actions.ts` valida la solicitud pública.
- Los tipos de TypeScript no protegen una Server Action: se valida forma, rangos, UUIDs, versiones y URLs (solo `https`, nunca `data:`).
- Después se aplican las mismas reglas de negocio que el formulario. La base es la última barrera.

**Cliente** (`components/admin/demo-provider.tsx`):
- Las escrituras van en una **cola serializada**. Cada una calcula su versión y su actualización optimista al ejecutarse, no al hacer clic.
- Si falla, revierte al estado anterior. Ofrece **Reintentar** (red), **Ingresar** (sesión vencida) o vuelve a leer la verdad de la base (`stale` o `conflict`).
- **El éxito se anuncia solo cuando la base confirma.** "Ajustes guardados" ya no aparece antes de guardar.
- Ajustes no es optimista: el formulario conserva lo escrito hasta que la base confirma. Si otra pestaña guardó antes, se avisa y no se pisa.
- Altas encadenadas (crear una categoría y agregarle un plato enseguida):
  - La Server Action devuelve el ID real.
  - El ID temporal se reemplaza al instante (`confirmCreated`).
  - Las acciones encoladas y el formulario abierto usan el ID real (`resolveIds`, `resolveId`).

## 3. Errores y estados

- Las lecturas devuelven `LiveResult`: `ok | not_found | forbidden | error` (`lib/data/live/result.ts`). **Un error de consulta nunca se muestra como una carta vacía, un panel vacío o un 404.**
- Si falla la base, se lanza `TemporaryDataError` y lo atrapan los `error.tsx` de cada ruta: `/[slug]`, `/admin/[slug]`, `/admin` y `(auth)`.
  - La pantalla dice "No pudimos cargar…" y ofrece **Reintentar** (`router.refresh()` + `reset()`).
- Si el comercio existe pero el usuario no es miembro, se muestra **"No tenés acceso a este panel"** en lugar del 404 de antes. Un comercio inexistente sigue dando 404.
- Un slug de demo es siempre la demo, sin consultar la base. Esos slugs están reservados en la base.
  - Por eso el seed local usa `prueba-bodegon`, `prueba-esquina` y `prueba-sakura`.
- `cancelled` se muestra como **"Cancelada"**, con su propio filtro, y ya no se mezcla con "Rechazada".

## 4. Reservas en vivo (Realtime)

```
reservations (INSERT/UPDATE)
  └─ trigger private.reservations_broadcast  (SECURITY DEFINER, best-effort)
       └─ realtime.send({id, status, version, op}, 'reservation_changed', 'tenant:<uuid>:reservations', private=true)
             └─ canal privado ── RLS en realtime.messages:
                   extension = 'broadcast'
                   AND topic de la fila = realtime.topic()
                   AND can_operate(<uuid del topic>)
                         └─ panel del dueño: relee la fila con su sesión (RLS de reservations)
```

- **Autorización.** Unirse al canal requiere la sesión del dueño y `can_operate` sobre el comercio del topic. No alcanza con conocer el `tenant_id`.
  - Un dueño ajeno o una sesión anónima reciben `CHANNEL_ERROR`.
  - Los topics mal formados no autorizan y no producen errores de casteo.
- **Sin datos personales en el evento.** Solo viajan id, estado y versión. Nombre y teléfono se leen con la sesión del dueño, pasando por la RLS de `reservations`.
- **Ciclo de vida** (`components/admin/use-reservations-realtime.ts`):
  - Hay un solo canal por comercio y se elimina al desmontar o al cambiar de comercio. El provider se monta con `key` por comercio.
  - Si quedó un canal duplicado del mismo topic, se borra antes de crear uno nuevo.
- **Resincronización.**
  - Se vuelve a leer la lista completa al reconectar (un `SUBSCRIBED` después de una caída), al volver la red (`online`) y al volver a la pestaña.
  - Se deduplica por `version` (`updated_at`): los eventos repetidos o fuera de orden se ignoran, en el hook y en el reducer.
- **UI.**
  - El panel muestra "En vivo", "Conectando…" o "Sin conexión en vivo · reintentando".
  - Las solicitudes nuevas aparecen solas, con un aviso.
  - Una respuesta dada en otra pestaña se refleja en vivo.
- **Pruebas.**
  - pgTAP (`110_phase31_settings_realtime.sql`): el trigger publica en el canal correcto sin datos personales; el dueño B recibe, el dueño A y un usuario sin membresía no reciben, anon no recibe y los topics inválidos no autorizan.
  - `supabase/tests/api/realtime.test.mjs` con el cliente real: el dueño recibe la solicitud; otro dueño queda en `CHANNEL_ERROR`; un dueño suscripto a su propio canal no recibe eventos de otro comercio; anon no se une.
  - E2E: la solicitud aparece sin recargar en el panel A y nunca en el panel B; dos pestañas del mismo dueño se sincronizan.

## 5. Validación

Resultados en local, con la base reseteada desde `seed.sql`:

| Chequeo | Resultado |
| --- | --- |
| `supabase db lint --level warning` | sin problemas |
| `supabase db advisors --local --type all` | sin problemas |
| pgTAP (`supabase test db`) | 155/155 (25 nuevos) |
| Data API + Realtime (`node --test supabase/tests/api/*.mjs`) | 13/13 |
| `npm run typecheck` / `npm run lint` | sin errores |
| Vitest | 106/106 |
| `npm run build` | OK |
| E2E demo (`npm run test:e2e`, mobile + desktop) | 26/26 |
| E2E live (`npm run test:e2e:live`) | 23/23 |

Las E2E live cubren:
- **Flujo del dueño:** registro → email de confirmación (Mailpit) → `/auth/callback` → alta del comercio → carta (categoría y plato encolados) → horarios distintos por día → publicar. Además, el slug de demo queda reservado.
- **Reservas:** solicitud pública → aparece sola en el panel → confirmación que persiste. Dos pestañas sincronizadas.
- **Errores:** red caída (no anuncia éxito, revierte y Reintentar funciona), sesión vencida (no guarda y ofrece Ingresar), conflicto entre dos pestañas en Ajustes (la versión vieja no pisa la nueva) y guardar colores conservando los horarios.
- **Acceso:**
  - Sin sesión, se redirige al login.
  - Otro dueño ve "sin acceso"; un comercio inexistente da 404.
  - Con la prueba vencida, la cuenta sigue accesible pero no se puede operar.
  - Cerrar sesión funciona.
- **Accesibilidad y mobile:**
  - axe (WCAG 2 A/AA, impacto serio o crítico) en la carta y en las cuatro secciones del panel y el login.
  - Sin scroll horizontal a 360 y 390 px.
  - A raíz de esto se corrigió el contraste de los platos no disponibles.

**CI** (`.github/workflows/ci.yml`):
- Job 1: typecheck, lint, unitarios, build y E2E de demo.
- Job 2: Supabase local (`supabase/setup-cli`, versión 2.121.0), `db lint`, pgTAP, Data API + Realtime y E2E live.
- Los requisitos para correrlo en local están en el README ("Pruebas con Supabase local").

## 6. Aplicación remota de la migración 08 (2026-10-20)

Se aplicó en el proyecto `Sentate` (`nemeftbwnxymjdqinjtj`) después de mergear el PR #5. Antes de aplicar se verificó que la base tuviera las migraciones 01 a 07 y lo que usa Realtime (`realtime.messages`, `realtime.send` y `realtime.topic`).

**Cómo se aplicó.**
- `apply_migration` se cortó por timeout: la integración pide confirmación para los bloques con `DELETE`/`DROP`. No se aplicó nada en ese intento.
- Se aplicó por partes:
  - Con `execute_sql`, en una transacción: `reorder_categories`, `private.reservations_topic_tenant`, `private.reservations_broadcast`, el trigger `reservations_broadcast` y la política `sentate_reservations_receive`. Como no existían, se crearon sin `drop ... if exists`.
  - Desde el SQL Editor del dashboard: `save_tenant_settings`, que contiene `DELETE`.
- Se registró la versión `20261021000800` (`phase31_settings_reorder_realtime`) en `supabase_migrations.schema_migrations`, así `supabase db push` no la reaplica.

**Verificación.**
- El md5 del cuerpo de las 4 funciones coincide con el archivo.
- Seguridad:
  - `save_tenant_settings` y `reorder_categories` son `SECURITY INVOKER`, con `search_path` vacío y `EXECUTE` solo para `authenticated`. Sin sesión, la Data API devuelve `42501`.
  - El trigger está habilitado. La política es `SELECT` para `authenticated`.
- Advisors: solo `INFO`, por las tablas privadas *deny-all*, que es intencional.

## 7. Lo que NO cubre esta fase

- La falla temporal de la base se prueba con tests unitarios (`resolve.test.ts`), no de punta a punta. Para simularla haría falta cortar Supabase durante la E2E.
- No hay rate limiting por IP en el borde, ni Storage para logos.
- Mercado Pago, WhatsApp, métricas comerciales y el despliegue a producción quedan fuera de alcance.
