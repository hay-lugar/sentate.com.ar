# Sentate

Menú digital y solicitudes de mesa para locales gastronómicos. Next.js 16 (App Router) + Supabase (Postgres con RLS, Auth, Realtime y Storage).

Hay **tres modos** que no se mezclan:

| Modo | Qué es | Datos | Base |
|---|---|---|---|
| **Demo** | `/el-bodegon`, `/la-esquina`, `/sakura` y su panel. Para mostrar el producto | Ficticios (`data/fixtures.ts`), en el navegador | Ninguna |
| **Desarrollo / pruebas** | Supabase **local** (Docker) con `supabase/seed.sql` | Ficticios (`@example.test`, teléfonos `11 0000-NNNN`) | Local |
| **Piloto** | Comercios reales en `sentate.com.ar` | Reales | Proyecto Supabase remoto |

Prueba: **30 días sin tarjeta**, **$14.999 ARS por mes** (`lib/config/plan.ts`). Sin pagos online, sin WhatsApp ni email automáticos al comensal: una solicitud de mesa queda **pendiente** hasta que el local la acepta o rechaza a mano.

## Requisitos

- Node.js ≥ 22.18 (el script de preflight ejecuta TypeScript directo; la app corre con ≥ 20.9) y npm
- Docker + CLI de Supabase (`npx -y supabase@2.121.0`) solo para pruebas de base de datos y E2E live

## Instalación y ejecución (demo)

```bash
npm ci
npm run dev                      # http://localhost:3000, modo demo
npm run build && npm start       # modo producción
```

Sin variables de entorno la app corre solo con la demo. Para registro, panel real y reservas en vivo hay que configurar Supabase (ver abajo).

## Variables de entorno

Plantilla: [`.env.example`](.env.example). Los archivos `.env*` reales están ignorados por git; solo se versiona la plantilla.

| Variable | Modo | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | dev, piloto | Proyecto Supabase. **Solo la clave publicable**; nunca `service_role` |
| `APP_URL` | dev, piloto | Origen público (sin ruta) para enlaces de email y QR. Piloto: `https://sentate.com.ar` |
| `RATE_LIMIT_IP_HEADER`, `RATE_LIMIT_SECRET` | piloto | Límite por conexión del formulario de reservas. Sin ellos, en producción el formulario **falla cerrado** |
| `RATE_LIMIT_MODE=off` | dev, demo | Apaga el límite a propósito. No usar en el piloto |
| `NEXT_PUBLIC_DEMO_SIMULATE` | demo | `error` o `lento` para simular red |

Antes de cargar variables en Vercel, verificá el conjunto sin imprimir valores:

```bash
npm run preflight -- --target=pilot --env-file=.env.pilot
```

## Pruebas

```bash
npm run check                  # typecheck + lint + Vitest + build
npm run test:e2e               # E2E demo (Playwright; requiere build). PW_CHROMIUM_PATH=… si ya tenés Chromium
npm run test:db                # pgTAP (Supabase local levantado)
node --test supabase/tests/api/data-api.test.mjs supabase/tests/api/realtime.test.mjs
npm run test:e2e:live          # E2E contra Supabase local (hace db reset antes)
```

Supabase local:

```bash
npx -y supabase@2.121.0 start -x imgproxy,studio,edge-runtime,logflare,vector,supavisor
npx -y supabase@2.121.0 db reset          # migraciones + seed ficticio
```

Usuarios del seed (contraseña `sentate-dev-only`, **solo local**): `owner.bodegon@example.test` (`/admin/prueba-bodegon`), `owner.esquina@example.test`, `owner.sakura@example.test` (prueba vencida), `owner.borrador@example.test` (local sin publicar), `recuperacion@example.test`, `sin.local@example.test`. Los emails se leen en Mailpit (`http://127.0.0.1:54324`).

El CI (`.github/workflows/ci.yml`) corre en cada PR: typecheck, lint, Vitest, build, E2E demo y, en un segundo job, Supabase local con `db lint`, pgTAP, Data API, Realtime, Storage y E2E live. `tests/unit/repo-hygiene.test.ts` falla si se versiona un secreto, un teléfono o email que no sea ficticio, o un log con datos personales.

## Migraciones

`supabase/migrations/` (orden cronológico). **No se aplican solas**: el piloto usa un proyecto remoto y aplicarlas es un paso manual (`supabase link` + `supabase db push`, o el SQL editor). Antes de aplicar, comparar con `supabase migration list`. Detalle y orden en [`docs/piloto.md`](docs/piloto.md).

## Documentación

| Tema | Documento |
|---|---|
| **Operar el piloto** (Vercel, dominio, Supabase, humo, rollback) | [`docs/piloto.md`](docs/piloto.md) |
| Demo, fechas y horarios, arquitectura, accesibilidad | [`docs/demo-y-arquitectura.md`](docs/demo-y-arquitectura.md) |
| Modelo de datos y RLS | [`docs/fase-2-modelo-de-datos.md`](docs/fase-2-modelo-de-datos.md) |
| Auth y datos reales | [`docs/fase-3-auth-y-datos.md`](docs/fase-3-auth-y-datos.md), [`docs/fase-3.1-estabilizacion.md`](docs/fase-3.1-estabilizacion.md) |
| Recuperación de contraseña | [`docs/auth-recuperacion.md`](docs/auth-recuperacion.md) |
| Imágenes (Storage) | [`docs/imagenes-storage.md`](docs/imagenes-storage.md) |
| QR de la carta | [`docs/qr.md`](docs/qr.md) |
| Reservas y antiabuso | [`docs/reservas-piloto.md`](docs/reservas-piloto.md) |

## Seguridad en una línea

RLS en todas las tablas; bucket de imágenes privado con URLs firmadas; el navegador solo ve la clave publicable; la IP del comensal nunca se guarda (solo un HMAC); los logs pasan por `lib/log/redact.ts`; `/admin`, `/login`, `/registro`, `/recuperar` y `/auth/` no se indexan. Cabeceras de seguridad en `next.config.ts`.
