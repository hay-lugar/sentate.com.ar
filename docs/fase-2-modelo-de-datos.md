# Fase 2: modelo de datos y seguridad

Estado: **implementado y probado en un Supabase local**. No se aplicó a ninguna base remota.
El frontend sigue con mocks (sin cambios en esta fase).

> **Dependencia abierta:** esta rama se apoya en `fase-1.1` (PR #1). Ese PR seguía **abierto y sin
> aprobación registrada** cuando se preparó esta fase. Mergear la Fase 2 solo después de aprobar la 1.1.

## 1. Fuentes consultadas (documentación oficial de Supabase, octubre 2026)

| Tema | Fuente | Qué se tomó |
| --- | --- | --- |
| RLS | [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) | RLS en toda tabla de esquemas expuestos; `to <rol>` en cada política; una política por operación; `UPDATE` con `USING` + `WITH CHECK` (además necesita una política `SELECT`); `(select auth.uid())` para que se evalúe una vez por consulta; índices en columnas filtradas; no usar `user_metadata`; las vistas saltean RLS salvo `security_invoker`; los helpers `security definer` van fuera de los esquemas expuestos |
| Funciones | [Database functions](https://supabase.com/docs/guides/database/functions) | Preferir `security invoker`; con `definer`, `search_path = ''` y nombres cualificados; revocar `EXECUTE` a `public`/`anon` y otorgarlo solo a los roles necesarios |
| API | [Securing your API](https://supabase.com/docs/guides/api/securing-your-api) | Grants **y** RLS en cada objeto expuesto; los grants por defecto en `public` se están volviendo opt-in (acá se revocan explícitamente); esquema `private` no expuesto; RLS no cubre rate limiting |
| Columnas | [Column Level Security](https://supabase.com/docs/guides/database/postgres/column-level-security) | Los privilegios por columna son avanzados: se usan **solo para `UPDATE`/`INSERT`**. Para `SELECT`, los datos privados van en otras tablas |
| Pruebas | [Testing your database](https://supabase.com/docs/guides/database/testing), [Advanced pgTAP](https://supabase.com/docs/guides/local-development/testing/pgtap-extended) | pgTAP en `supabase/tests/database`, `supabase test db`, archivo de setup con helpers que cambian a los roles reales |
| Advisors | `supabase db advisors` (Splinter) | Ejecutado: 0 hallazgos de seguridad y de rendimiento |

## 2. Modelo

```
auth.users ─┐
            │ 1..n            (on delete cascade: solo la membresía)
public.tenant_members (tenant_id, user_id) PK compuesta · role = owner
            │
public.tenants (id uuid PK, slug único normalizado, datos públicos, colores, timezone,
            │   is_published [dueño], status [plataforma])
            ├── public.tenant_subscriptions (1:1, estado comercial; solo lectura para miembros)
            ├── public.tenant_shifts        (turnos por día de semana)
            ├── public.tenant_closures      (cierres puntuales por fecha de servicio)
            ├── public.categories (unique (tenant_id, id))
            │        └── public.menu_items  FK (tenant_id, category_id) → categories(tenant_id, id)
            └── public.reservations         (on delete RESTRICT)
private.settings     · decisión pendiente sobre la carta pública (§5)
private.plan_config  · días de prueba, precio y moneda
```

**Decisiones clave**

- **Identidad = `tenants.id`.** El `slug` solo sirve para lookup y URL. Cambiarlo no cambia ni permisos
  ni relaciones: todas las FK y políticas usan el UUID.
- **Lo privado va en tablas aparte.** RLS filtra filas, no columnas. Por eso `tenants` solo tiene campos
  publicables (incluido el teléfono *del comercio*). Membresías, suscripción y datos de comensales viven
  en tablas a las que `anon` no tiene grant.
- **Precio exacto:** `numeric(12,2)` con check `0 ≤ price ≤ 10.000.000`, más `currency char(3)`.
- **Plato y categoría del mismo comercio:** FK compuesta `(tenant_id, category_id)`. Un plato no puede
  apuntar a la categoría de otro tenant, ni al crearse ni al moverse.
- **Borrado:** todas las FK hacia `tenants` son `RESTRICT`, así que no hay cascadas que borren reservas.
  La única cascada es categoría → platos, y el panel la confirma antes. Borrar un usuario de Auth borra
  solo su membresía.
- **Índices por consulta:** `tenant_members(user_id)` para las políticas;
  `reservations(tenant_id, service_date, starts_at)` para la agenda;
  `reservations(tenant_id, status, created_at desc)` para la bandeja;
  `categories(tenant_id, position)`; `menu_items(tenant_id, category_id, position)`;
  `tenant_shifts(tenant_id, weekday, opens_at)`.

### Horarios: representación explícita

- **Turnos:** una fila de `tenant_shifts` por turno y por **día de la semana en que abre**
  (`weekday` 0 = domingo … 6, como `extract(dow)`). Las horas son de reloj en `tenants.timezone`.
- **Cruce de medianoche:** si `closes_at <= opens_at`, el turno cruza la medianoche. Los horarios
  posteriores a 00:00 pertenecen a la **fecha de servicio** del día en que abrió. No hay reglas del tipo
  "antes de las 6 es del día anterior".
- **Varios turnos por día:** se permiten, pero el trigger rechaza superposiciones, incluso entre el sábado
  y el domingo (semana circular). Cada turno dura como máximo 16 h y se define en múltiplos de 15 min.
- **Cierres puntuales:** van en `tenant_closures(service_date)`.
- **Reservas:** guardan `starts_at timestamptz` (instante absoluto) y `service_date date` (fecha de
  servicio en la zona del comercio). Ejemplo: 01:00 del sábado en un turno 20:00–02:00 del viernes →
  `service_date` = viernes, `starts_at` = sábado 04:00 UTC.
- **Mapeo al frontend:** `schedule.openDays` + `schedule.shifts[]` se traduce a filas por día.

## 3. Matriz de acceso (probada)

| Operación | Visitante | Con sesión, sin membresía | Owner A sobre A | Owner A sobre B | Owner con prueba vencida |
| --- | --- | --- | --- | --- | --- |
| Leer comercio publicado (campos públicos) | ✅ | ✅ | ✅ | ✅ | ✅ (§5) |
| Leer comercio sin publicar | ❌ | ❌ | ✅ | ❌ | ✅ (solo su cuenta) |
| Leer categorías visibles / platos disponibles | ✅ | ✅ | ✅ (y los ocultos) | ✅ solo públicos | ✅ solo públicos |
| Editar carta, horarios, información | ❌ | ❌ | ✅ | ❌ | ❌ |
| Cambiar `tenants.status`, `id` o `tenant_id` de filas | ❌ | ❌ | ❌ | ❌ | ❌ |
| Leer reservas / teléfonos de clientes | ❌ | ❌ | ✅ | ❌ | ❌ |
| Cambiar estado de reservas | ❌ | ❌ | ✅ (transiciones válidas) | ❌ | ❌ |
| Insertar o borrar reservas directamente | ❌ | ❌ | ❌ | ❌ | ❌ |
| Solicitar reserva (`request_reservation`) | ✅ | ✅ | ✅ | ✅ | ❌ (`tenant_unavailable`) |
| Leer membresías | ❌ | solo las propias (0) | las propias | ❌ | las propias |
| Crear/editar membresías o roles | ❌ | ❌ | ❌ | ❌ | ❌ |
| Leer suscripción | ❌ | ❌ | ✅ | ❌ | ✅ (pantalla de suscripción) |
| Editar suscripción o prueba | ❌ | ❌ | ❌ | ❌ | ❌ |
| Alta de comercio (`create_tenant`) | ❌ | ✅ | ✅ | ✅ | ✅ |

**Cómo se aplica la matriz:**

- **Grants mínimos.** `revoke all` en todas las tablas y luego grants explícitos. `UPDATE`/`INSERT` por
  columna en las tablas que edita el dueño.
- **Políticas.** Una política `SELECT` por rol y políticas separadas por operación. Todo `UPDATE` lleva
  `USING` + `WITH CHECK`.
- **Helpers en `private` (`SECURITY DEFINER`):** `is_tenant_member`, `tenant_has_operational_access`,
  `can_operate`, `is_publicly_visible`.
  - Son `SECURITY DEFINER` porque evitan la recursión de RLS sobre `tenant_members`, y porque la
    visibilidad pública depende del estado de la suscripción, que `anon` no puede leer.
  - La identidad sale siempre de `auth.uid()`; nunca de `user_metadata`, el slug o IDs enviados por el
    cliente. Las pruebas inyectan un `user_metadata` malicioso y verifican que no concede acceso.
- **Prueba vencida.** `tenant_has_operational_access` calcula con `now()` en cada operación. Un estado
  `trialing` con `trial_ends_at` pasado bloquea igual, sin depender de un cron.

## 4. Operaciones controladas (contratos para Fase 3)

Patrón: la implementación `SECURITY DEFINER` vive en `private`, que no está expuesto. Un envoltorio
`SECURITY INVOKER` en `public` es lo único que alcanzan la Data API y la Server Action. Los errores de
negocio salen con `SQLSTATE P0001` y un código estable en `message`.

### `public.create_tenant(p_slug, p_name, p_timezone default null) → jsonb`

- **Quién:** solo `authenticated`. El owner es `auth.uid()` y tiene que existir en `auth.users`.
- **Parámetros rechazados:** no recibe owner, estado de suscripción ni `trial_ends_at`.
- **Atomicidad:** en una sola transacción crea `tenants`, la membresía `owner` y
  `tenant_subscriptions(trialing, now() + plan_config.trial_days)`. Si cualquier paso falla, no queda
  nada (probado inyectando una falla).
- **Reintentos:** hay un lock por slug. Si el mismo usuario reintenta con el mismo slug, recibe el mismo
  comercio con `created: false`. Si el slug es de otro usuario: `slug_taken`.
- **Respuesta:** `{ tenant_id, slug, created, trial_ends_at }`. El comercio nace **sin publicar**.
- **Errores:** `not_authenticated`, `invalid_slug` (formato o reservado), `invalid_name`,
  `invalid_timezone`, `slug_taken`.
- **Limitación del MVP:** un mismo usuario puede dar de alta varios comercios, y una persona puede crear
  otra cuenta para empezar otra prueba. Las medidas antiabuso (verificación de email o teléfono, límite
  de pruebas por identidad o medio de pago, revisión manual) quedan para cuando entre Mercado Pago.

### `public.request_reservation(p_tenant_id, p_service_date, p_time, p_guests, p_customer_name, p_customer_phone, p_notes, p_idempotency_key) → jsonb`

- **Quién:** `anon` y `authenticated`. No hay grants sobre `reservations` para el público.
- **Validaciones en orden:**
  1. Idempotencia por `(tenant_id, p_idempotency_key)`, protegida con un lock.
     - Misma clave y mismo contenido → misma reserva con `replayed: true`.
     - Misma clave con otro contenido → `idempotency_key_reused`.
  2. El comercio está publicado, activo y con acceso vigente; si no, `tenant_unavailable` (mismo error
     si no existe).
  3. Datos del comensal: `invalid_guests` (1–8), `invalid_name`, `invalid_phone` (8–15 dígitos),
     `invalid_notes` (≤ 280).
  4. Fecha de servicio entre ayer (madrugada del turno en curso) y hoy + 13 en la zona del comercio:
     `date_out_of_range`. Cierre puntual: `tenant_closed`.
  5. Horario múltiplo de 30 min (`invalid_slot`), dentro de un turno de ese día de servicio y hasta 1 h
     antes del cierre (`outside_opening_hours`), y al menos 30 min en el futuro (`slot_too_soon`).
- **Estado:** siempre `pending`. La firma no acepta estado, `user_id` ni `tenant_id` privilegiados.
- **Respuesta mínima:** `{ reservation_id, status, service_date, starts_at, replayed }`.
- **Server Action (Fase 3):**
  - Generar `p_idempotency_key` (UUID) al abrir el formulario y reutilizarlo en cada reintento.
  - Mapear los códigos de error a mensajes de UI.
  - Usar el cliente con la clave publicable, **no** `service_role`.

### Transiciones de reservas

```
pending ──► confirmed ──► cancelled
   │
   ├──► rejected   (terminal)
   └──► cancelled  (terminal)
```

- **Dónde se aplican:** las valida el trigger `reservations_guard_update`, que además completa
  `decided_at`.
- **Qué puede tocar el dueño:** solo `status`. Los datos del comensal, el horario y el `tenant_id` son
  inmutables (grants por columna más el trigger).
- **Impacto en Fase 3:** el "Deshacer" del panel demo (confirmed → pending) **no** es una transición
  válida. En Fase 3 tiene que ser un deshacer *antes* de enviar el cambio (enviar con demora), no una
  reversión en la base.

### Lo que RLS NO resuelve (Fase 3)

- **Spam y abuso:** RLS no limita la cantidad de solicitudes. La Server Action tiene que aplicar:
  - rate limiting por IP y por comercio (por ejemplo, un contador en `private` o un servicio como
    Upstash);
  - CAPTCHA o Turnstile después de N intentos;
  - límite de solicitudes pendientes por teléfono;
  - registro de abuso.
- **Capacidad real y sobreventa:** esta fase **no** gestiona capacidad. Las reservas son solicitudes que
  el dueño confirma a mano: no hay cupos ni asignación de mesa, y la UI no debe mostrar disponibilidad
  real. La ampliación explícita sería: capacidad por turno, `exclusion constraint` o un contador con lock
  por `(tenant, service_date, slot)`, y confirmación automática opcional.

## 5. Decisión de producto pendiente: la carta pública al vencer la prueba

Está aislada en **una sola configuración explícita**, no escondida en las políticas:
`private.settings.public_menu_when_access_lapsed`.

| Valor | Efecto | Pros | Contras |
| --- | --- | --- | --- |
| `visible` (**valor actual**) | La carta sigue pública; las reservas y el panel se bloquean | No rompe el QR de las mesas ni los links compartidos; menos fricción para convertir | El servicio sigue dando valor sin pago |
| `hidden` | El comercio desaparece de la vista pública | Incentivo fuerte para pagar | Clientes del local ven el QR roto; mala experiencia y riesgo de reputación |

Las dos variantes están probadas (`060_trial_expiry.sql`). **Decisión pendiente del negocio.** Cambiarla
es un `update` de una fila (o una migración, si se quiere versionar).

## 6. Aplicar y verificar en local

Requisitos: Docker y Node 20+. La CLI se usa con `npx` (probada con `supabase@2.121.0`).

```bash
npx supabase start                    # stack local (Postgres 17, Auth, PostgREST)
npx supabase db reset                 # aplica supabase/migrations + supabase/seed.sql
npx supabase test db                  # pgTAP: supabase/tests/database
node --test supabase/tests/api/data-api.test.mjs   # Data API real (requiere el seed)
npx supabase db advisors --local --type all        # advisors de seguridad y rendimiento
npx supabase db lint --local -s public,private     # plpgsql_check
```

- **Usuarios del seed** (contraseña `sentate-dev-only`, solo local): `owner.bodegon@example.test`,
  `owner.esquina@example.test`, `owner.sakura@example.test` (prueba vencida) y `sin.local@example.test`.
- **Independencia de las pruebas:** las pgTAP crean sus propios datos (`tests.seed_two_tenants()`) dentro
  de una transacción con `rollback`. No dependen del seed.

## 7. Resultados (entorno local, 2026-10-20)

| Comprobación | Resultado |
| --- | --- |
| `supabase db reset` (6 migraciones + seed) | ✅ |
| `supabase test db` | ✅ 10 archivos, **119 pruebas** |
| Pruebas de mutación (política permisiva, grant extra, acceso siempre vigente) | ✅ las pruebas **fallan** como corresponde (19 fallos); se restauró con `db reset` |
| Data API real (`node --test …`) | ✅ **10 pruebas**, incluida la idempotencia con 8 envíos concurrentes |
| `supabase db advisors --type all` | ✅ sin hallazgos (al principio hubo 5 avisos de rendimiento por políticas permisivas múltiples; se corrigieron con una política `SELECT` por rol) |
| `supabase db lint` | ✅ sin errores |

## 8. Plan de despliegue y recuperación (para cuando haya proyecto remoto)

1. **Antes de aplicar:**
   - Backup del proyecto (PITR o `supabase db dump`).
   - Revisar el plan con `supabase db push --dry-run`.
   - Aplicar primero en un branch o proyecto de staging y correr las pruebas.
2. **Aplicar** con `supabase db push`. Las migraciones son aditivas sobre una base vacía.
   **No ejecutar `seed.sql` en remoto.**
3. **Si algo sale mal:**
   - Sin datos de usuarios todavía: revertir con una migración nueva que elimine los objetos creados, o
     restaurar el backup.
   - **Con datos reales:** no hay rollback destructivo que recupere información. Eliminar tablas *borra*
     datos. Se corrige **hacia adelante** con una migración nueva, y si hay pérdida se recupera desde
     PITR o backup (con la ventana de pérdida que eso implique).
4. **Cambios posteriores:** siempre con migraciones nuevas versionadas. No editar migraciones ya aplicadas
   en un entorno compartido. En esta rama se editó la 05 solo porque nunca se aplicó fuera del entorno
   local.

## 9. Límites y pendientes

- **Sin roles adicionales:** no hay `staff` todavía. El enum `tenant_role` y la tabla de membresías ya
  soportan varios comercios por usuario y nuevos roles.
- **Sin baja de comercio:** borrar un comercio con reservas está bloqueado por `RESTRICT`. La baja o
  anonimización es un flujo a diseñar (requisitos legales de retención de datos personales).
- **Logos e imágenes:** son URLs `https`. La subida con Supabase Storage (bucket por tenant y sus
  políticas) es Fase 3.
- **Carrera en la superposición de turnos:** dos inserts concurrentes podrían esquivar la validación de
  superposición. El riesgo es bajo porque edita un solo dueño. Se puede blindar con un lock por tenant en
  el trigger.
- **Cambio de zona horaria del comercio:** no reescribe reservas existentes, que son instantes
  absolutos. Sí cambia cómo se interpretan los turnos de ahí en adelante.
- **Precio y prueba duplicados:** viven en `private.plan_config` y en el espejo del frontend
  (`lib/config/plan.ts`). En Fase 3 el front debería leerlos del servidor o tener una prueba que detecte
  si se desalinean.
