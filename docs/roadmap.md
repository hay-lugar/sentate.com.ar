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

### Fase 3 (experiencia del comercio)
El inicio y la página de Reservas del panel respetan las reservas opcionales: con las reservas apagadas no muestran solicitudes ni agenda vacías, sino un aviso con acceso a Capacidad (el historial se conserva). Nuevo filtro «Hoy» en reservas (mesas de hoy confirmadas y pendientes). Cubierto por E2E demo y E2E live.

### Fase 1
maplibre 6, reservas opcionales, filtro «Acepta reservas», SEO, landing híbrida, marca configurable, checklist, base de notificaciones.
