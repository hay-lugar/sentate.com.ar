# Hoja de ruta y decisiones pendientes

## Prioridades
1. **Operativo**: aplicar migraciones nuevas al remoto, rotar credenciales, SMTP, primer superadmin (ver `docs/AUDITORIA_ACTUAL.md`).
2. **Seguridad**: CSP/cabeceras, limitación de tasa, backups.
3. **Comercio**: mejoras de agenda/panel y onboarding.
4. **Comensal**: capturas y auditoría visual, listas/mapa.
5. **Monetización**: catálogo de planes y Mercado Pago.
6. **Lanzamiento**: dominio, SEO real, métricas.

## Planes y cobros (diseño, no implementado)
- Catálogo configurable en base (`plans`: código, precio, moneda, período, días de prueba, límites), sin precios hardcodeados. El precio publicado no cambia sin decisión.
- Suscripción por comercio con estados (`trialing`, `active`, `past_due`, `canceled`) y período de gracia configurable.
- Mercado Pago: empezar en sandbox; webhooks con verificación de firma, tabla de eventos con clave de idempotencia, y job de reconciliación contra la API. Sin cobros reales hasta autorización explícita.

## Multisucursal (diseño)
Entidad `organizations` opcional por encima de `tenants`; cada sucursal sigue siendo un tenant con su propio slug, perfil geográfico y reservas. Un usuario pertenece a la organización con rol. Sin tocar RLS actual hasta que haya un caso real.

## Analítica
Solo métricas reales y propias: vistas de carta, aperturas de reserva, solicitudes. Sin terceros por defecto, sin PII. Hasta implementarlo, no se muestran cifras.

## Decisiones comerciales pendientes
Nombre definitivo (hoy `{Sin Nombre}`), dominio, proveedor de email, política de moderación y destacados, qué cobrar y desde cuándo.

## Despliegue
Preview automático por PR en Vercel; producción solo con autorización. Migraciones aditivas por Management API y registro en `supabase_migrations.schema_migrations`; nunca `db reset` sobre el remoto.

## Pruebas
`npm run check` (tipos, lint, unit, build); `npm run test:e2e` (demo); en CI: pgTAP, Data API, Realtime, concurrencia y `test:e2e:live`.

## Registro de cambios

### Fases 5 a 7 (operación, comercialización, lanzamiento)
- **Seguridad:** CSP en modo solo reporte (`next.config.ts`). Medido contra landing, ingreso, carta, explorador y panel: el único aviso es el `eval` de MapLibre; resolverlo (o aceptarlo con `'unsafe-eval'`) y migrar los scripts en línea a nonce son los pasos para volverla obligatoria. Limitación de tasa ya existía en reservas (`lib/abuse/rate-limit.ts`); no se agregó a otros endpoints.
- **Cobros:** base de registro idempotente de eventos de Mercado Pago, sin activar suscripciones (ver `docs/pagos.md`).
- **Sin hacer, a propósito:** catálogo de planes en base (un único plan; duplicaría `lib/config/plan.ts` sin necesidad), analítica de uso (requiere decidir consentimiento y qué medir), multisucursal (diseño arriba, sin caso real), pruebas de carga y Lighthouse (no hay entorno de producción accesible para medir con datos reales).
- **Lanzamiento:** lista en `docs/AUDITORIA_ACTUAL.md` (acciones del dueño: credenciales, SMTP, OAuth, dominio, primer superadmin).

### Plan de 30 pasos — PR3: vida completa de la reserva
Nuevo estado **«no se presentó»** (solo desde confirmada y después de la hora; acción «No se presentó» en el panel, filtro y mensaje de contacto). Quien pidió la mesa ve **hasta cuándo puede responder el local** (`respond_by`, el vencimiento ya existía: 4 h por defecto, configurable en Capacidad) y qué pasa si no responde; las reservas rechazadas, canceladas, vencidas o no presentadas ofrecen «Pedir otra mesa». **Modificar = pedir una mesa nueva y cancelar la anterior** (no se edita una reserva). Migración aditiva `20261104000100`, pgTAP 270.

### Fase 4 (experiencia del comensal)
Carta: buscador por nombre/descripción (sin tildes) en cartas de 10 o más platos, combinable con el filtro dietario; enlace «Cómo llegar» con las coordenadas confirmadas del local (o la dirección si no las hay); texto de carta vacía coherente con reservas apagadas. Cubierto por pruebas unitarias y E2E demo. No se agregó nada que dependa de datos de uso, que todavía no existen.

### Fase 3 (experiencia del comercio)
El inicio y la página de Reservas del panel respetan las reservas opcionales: con las reservas apagadas no muestran solicitudes ni agenda vacías, sino un aviso con acceso a Capacidad (el historial se conserva). Nuevo filtro «Hoy» en reservas (mesas de hoy confirmadas y pendientes). Cubierto por E2E demo y E2E live.

### Fase 1
maplibre 6, reservas opcionales, filtro «Acepta reservas», SEO, landing híbrida, marca configurable, checklist, base de notificaciones.
