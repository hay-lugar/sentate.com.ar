# Auditoría actual

Estado verificado al inicio de la Fase 1 (rama `mejoras-fase-1`, PR #26). Todo lo de esta página se comprobó contra el repositorio, el CI o el proyecto Supabase remoto; lo que no se pudo comprobar figura como tal.

## Estado verificado

| Punto | Resultado |
|---|---|
| `main` | `ceea8a9` (PR #25 integrado), CI verde. Sin PR abiertos antes de la Fase 1. |
| Migraciones | 12 aplicadas en el remoto (`nemeftbwnxymjdqinjtj`) hasta `20261030000100`. Las dos nuevas (`20261031000100`, `20261031000200`) están en el PR y **no** se aplicaron al remoto. |
| Datos remotos | Vacío: no hay comercios ni reservas reales; no se cargó seed. |
| CI | Dos trabajos: tipos/lint/unit/build/E2E demo, y Supabase local (pgTAP, Data API, Realtime, concurrencia, E2E live). Solo corre en PR y en push a `main`. |
| Ramas viejas | `explorador-etapa-a..g` siguen en origin (el proxy bloquea el borrado remoto). Inofensivas; borrar a mano. |

## Funciona (probado)

Carta pública y QR, panel del comercio (menú, reservas, ajustes), explorador con mapa, filtros y «abierto ahora», perfil del comensal y favoritos, reservas con capacidad y concurrencia (pgTAP + Node), superadministración con auditoría, RLS en todas las tablas.

## Parcial / solo base

- **Notificaciones**: outbox, consentimiento, worker y plantillas listos y probados; **ningún proveedor activo**, por lo tanto no se envía nada real.
- **Planes y cobros**: el precio ($14.999 ARS/mes, 30 días gratis) y el estado de suscripción existen; no hay cobro, ni webhooks, ni catálogo configurable. Ver `docs/roadmap.md`.
- **Analítica**: sin eventos propios; no se muestran métricas inventadas.
- **Multisucursal**: sin modelo; hay diseño en `docs/roadmap.md`.

## Hallazgos y clasificación

**P0 (corregido en este PR)**
- `maplibre-gl` con vulnerabilidad crítica GHSA-jrc7-96c5-q579 → actualizado a 6.15.0. Cambio de API (sin export por defecto) y de worker: ahora el worker se sirve desde `/maplibre` (`scripts/copy-maplibre-worker.mjs`, ejecutado en `prebuild`/`predev`).

**P1 (corregido en este PR)**
- Las reservas no eran opcionales en la UI pública → `reservationsEnabled`; si están apagadas, la carta ofrece contacto directo.
- Sin filtro «Acepta reservas» → filtro, chip y `reserva=1` en la URL.
- Sin SEO → sitemap (solo comercios listados), robots, canonical/OG, JSON-LD desde el contrato público.
- Landing orientada solo a comercios → híbrida (buscar vs. publicar).
- Marca con config mínima → `BRAND` ampliada (`{Sin Nombre}` sin cambios).
- Sin guía de puesta en marcha → checklist en el panel.
- Sin notificaciones → base descrita arriba.

**P1 (pendiente, requiere al usuario)**
- Rotar `service_role`, quitar variables privilegiadas de Vercel, configurar SMTP/redirect URLs de Auth, plantilla de recuperación, primer superadmin, `GEOAPIFY_API_KEY`, Google/Apple OAuth.
- Aplicar las dos migraciones nuevas al remoto (aditivas).

**P2 (backlog)**
- CSP y cabeceras de seguridad; limitación de tasa en endpoints públicos; backups/PITR; medición Lighthouse; auditoría visual con capturas nuevas; analítica real; catálogo de planes + Mercado Pago; multisucursal.

## Pruebas ejecutadas en el CI de este PR

325+ unitarias, E2E demo (360/390/768/desktop), pgTAP incluidas 220 y 230, Data API, Realtime, concurrencia de capacidad y E2E live (incluye `reservas-opcionales`).

## Riesgos conocidos

- El SQL solo se valida en CI (no hay Docker local); Docker Hub puede limitar y obliga a re-ejecutar.
- Mapa y tiles dependen de OpenFreeMap (tercero, gratuito, sin SLA).
- Si se activa un proveedor de email sin dominio verificado, los avisos fallarán y quedarán registrados como `failed` (la reserva no se ve afectada).
