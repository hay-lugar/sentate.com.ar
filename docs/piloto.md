# Piloto: despliegue y operación

Fase 4, punto 7. Esta guía deja listo el piloto en `sentate.com.ar` **sin tocar producción ni recursos remotos**: todo lo de abajo marcado como «acción tuya» no se hizo desde el repositorio.

## Estado verificado (al escribir esto)

- Rama predeterminada del repositorio: `main` (verificado por la API de GitHub).
- Existe un proyecto de Vercel, pero **conectado a otro repositorio** y sin el código de Sentate desplegado (ver «Estado de Vercel»).
- Las migraciones `20261022000100` (Storage) y `20261022000200` (cupo por IP) **no están aplicadas** en el proyecto Supabase remoto.
- Nada de esto se probó en un dominio real: lo verificado es build, pruebas locales y CI.

## Estado de Vercel (verificado por la API)

- Proyecto `sentate.com.ar` (`prj_e0yII8gU89qvdYZu6CaVJ6o5pXM1`, equipo `geronimo-mendezs-projects`), framework Next.js, dominios `sentatecomar.vercel.app` (producción) y `…-git-main-…vercel.app`.
- **Está conectado a `geromendez199/sentate.com.ar`, no a `hay-lugar/sentate.com.ar`.** El único deploy (`8a4cb60`, «Initial commit · Created from vercel.com/new») es de ese repo, **no es el código de Sentate**. Hasta reconectar, los pushes a `main` de `hay-lugar` no despliegan nada.
- **Acción del titular (dashboard de Vercel):** *Settings → Git → Disconnect* y conectar `hay-lugar/sentate.com.ar` (hay que instalar la app de GitHub de Vercel con acceso a esa organización). **Posible traba:** el plan Hobby puede no permitir repositorios de una organización; si Vercel lo rechaza, las salidas son transferir el repo a tu cuenta personal o pasar a un plan de pago (decisión y costo tuyos; no se activó nada).
- **Variables de producción cargadas por la API** (solo valores públicos): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_URL=https://sentatecomar.vercel.app`, `RATE_LIMIT_IP_HEADER=x-real-ip`. Preview no tiene variables de Supabase (queda en demo).
- **Falta `RATE_LIMIT_SECRET`** (a propósito: no genero secretos en el chat). Generalo con `openssl rand -hex 32` y cargalo en Vercel → Settings → Environment Variables → Production, tipo *Sensitive*. Sin él el formulario de reservas falla cerrado.
- **Deployment Protection:** el proyecto tiene *Vercel Authentication* en «todo excepto dominios personalizados», así que `sentatecomar.vercel.app` pide iniciar sesión en Vercel. Para probar como público hay que bajarla a «solo previews» (Settings → Deployment Protection). No lo cambié.
- Node: el proyecto figura en 24.x; el repo fija `22.x` en `engines`, que prevalece en el siguiente build.
- **Plan Hobby:** es gratuito pero de uso **no comercial**. Cobrar $14.999 ARS por mes es uso comercial: antes de cobrar hay que pasar a un plan de pago.

## 1. Separación de entornos

| | Demo | Desarrollo | Piloto |
|---|---|---|---|
| Datos | `data/fixtures.ts` | `supabase/seed.sql` (ficticios) | Reales |
| Supabase | no | local (Docker) | proyecto remoto **propio del piloto** |
| `APP_URL` | cualquiera | `http://localhost:3000` | `https://sentate.com.ar` |
| Límite de IP | n/a | `RATE_LIMIT_MODE=off` | `RATE_LIMIT_IP_HEADER` + `RATE_LIMIT_SECRET` |
| Usuarios | n/a | `@example.test`, clave de desarrollo | personas reales |

Reglas: la clave de desarrollo `sentate-dev-only` y los usuarios del seed no existen en el remoto; no cargar el seed ahí. No usar el mismo proyecto Supabase para pruebas y para comercios reales. `tests/unit/repo-hygiene.test.ts` impide versionar datos reales como fixtures.

## 2. Vercel (acción tuya)

1. Conectar `hay-lugar/sentate.com.ar` al proyecto de Vercel, rama de producción `main`. Framework: Next.js (sin `vercel.json`; el build es `npm run build`). Node 22.
2. Variables. Hay un solo proyecto Supabase (el del piloto): **cargá las variables de Supabase solo en Production**. Sin ellas, Preview corre en modo demo y no toca datos reales:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase del piloto |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clave **publicable** |
   | `APP_URL` | `https://sentate.com.ar` (Preview: la URL de la preview) |
   | `RATE_LIMIT_IP_HEADER` | `x-real-ip` (confirmarlo en el primer deploy) |
   | `RATE_LIMIT_SECRET` | `openssl rand -hex 32` |

   No cargar `service_role`, `SUPABASE_DB_PASSWORD` ni `SUPABASE_ACCESS_TOKEN`: la app no los usa.
3. Antes de cargarlas, validar el conjunto: `npm run preflight -- --target=pilot --env-file=.env.pilot` (archivo local no versionado; el reporte nunca imprime valores).
4. Dominio: agregar `sentate.com.ar` (y `www` con redirección al apex) en el proyecto y apuntar el DNS como indique Vercel.
5. **Preview privada**: dejar activa la *Deployment Protection* de Vercel en Preview (por defecto) y usar un proyecto Supabase distinto del de producción. Las previews no deben compartir datos reales.
6. Opcional recomendado: regla de rate limiting en Vercel Firewall para `POST` a `/<slug>` (ver `docs/reservas-piloto.md`).

Cabeceras de seguridad (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) y `robots.txt` salen de `next.config.ts` y `app/robots.ts`, sin configuración en Vercel. **No hay CSP**: es una decisión pendiente (requiere probarla contra Next, framer-motion y las imágenes firmadas de Storage).

## 3. Supabase remoto (acción tuya)

**Migraciones.** Comparar antes con `npx -y supabase@2.121.0 migration list` (con el proyecto enlazado) y aplicar solo las que falten, en orden:

```
20261022000100_tenant_images_storage.sql      (bucket privado tenant-images, políticas, constraints)
20261022000200_reservation_ip_budget.sql      (cupo de solicitudes por conexión)
```

Las anteriores (`20261020…`, `20261021…`) deben figurar ya aplicadas; verificalo, no lo asumas. Hacer backup (o confirmar el de Supabase) antes de `db push`. Después correr los advisors de seguridad y performance del dashboard.

**Auth** (Dashboard → Authentication):

- Site URL: `https://sentate.com.ar`.
- Redirect URLs: `https://sentate.com.ar/auth/callback` (y la de preview si usás una).
- Confirmación de email activada; contraseña mínima 8.
- Plantilla *Reset Password* con `{{ .TokenHash }}` (contenido en `supabase/templates/recovery.html`; detalle en `docs/auth-recuperacion.md`). Si el enlace llega sin `token_hash`, la recuperación no funciona.
- **SMTP propio**: el SMTP integrado de Supabase tiene un tope bajo de emails por hora y solo envía a miembros del equipo. Para comercios reales hace falta un proveedor SMTP (decisión pendiente).

**Claves.** Rotar la `service_role` (acción tuya, pendiente): estuvo expuesta en una etapa anterior. La app no la usa.

**Storage.** El bucket `tenant-images` lo crea la migración; verificar que figure como privado. Límite 2 MiB, webp/jpeg/png (`docs/imagenes-storage.md`).

## 4. Pruebas de humo tras el primer deploy

En orden; cada una con una cuenta de prueba creada a propósito (no con datos de un comercio real):

1. `https://sentate.com.ar/` carga; `/robots.txt` bloquea `/admin`, `/login`, `/registro`, `/recuperar`, `/auth/`.
2. Registro con un email propio: llega el email, el enlace abre `https://sentate.com.ar/auth/callback…` y entra al alta del local.
3. Crear local, cargar carta, subir un logo, **publicar**.
4. `/<slug>` público: carga, muestra la imagen, el QR del panel apunta a `https://sentate.com.ar/<slug>`.
5. Desde un celular con datos móviles, enviar una solicitud de mesa. Si responde «Por ahora no podemos recibir solicitudes», faltan `RATE_LIMIT_*` o el header de IP es incorrecto (los logs lo dicen sin escribir la IP).
6. En el panel aparece la solicitud como «Pendiente» sin recargar (realtime); aceptarla/rechazarla.
7. Recuperar contraseña con ese email y entrar con la nueva.
8. Imprimir/escanear el QR con un teléfono (no está probado con un teléfono real).
9. Con 13 solicitudes seguidas desde una conexión, la 13.ª se bloquea.
10. Borrar la cuenta y los datos de prueba.

## 5. Rollback

- **App:** en Vercel, *Promote to Production* sobre el deployment anterior. Es inmediato y no toca la base.
- **Migraciones:** son aditivas (tablas, funciones, bucket, constraints). Volver atrás la app no las rompe: la versión anterior simplemente no las usa. Un revert de esquema no está automatizado; si hiciera falta, se hace con una migración nueva, nunca editando una ya aplicada.
- **Variables mal cargadas:** corregir en Vercel y redeployar; el cupo por IP falla cerrado, no abierto.

## 6. Operación

- **Logs:** Vercel → Logs. Los mensajes de error pasan por `lib/log/redact.ts`; no deberían contener contraseñas, tokens, teléfonos, emails ni comentarios. Si ves alguno, es un bug: reportalo.
- **Soporte a un comercio:** el dueño ve y gestiona sus solicitudes; Sentate no confirma mesas ni notifica al comensal. El contacto es manual (llamada/WhatsApp desde el panel).
- **Imágenes huérfanas:** `sweepOrphanImagesAction` desde el panel (`docs/imagenes-storage.md`).
- **Ajustar límites:** los números del cupo viven en la migración `20261022000200`; se cambian con una migración nueva.

## 7. Decisiones y pendientes

Acciones tuyas: crear el proyecto de Vercel y el dominio; cargar variables; aplicar las dos migraciones; configurar Auth (URLs, plantilla, SMTP); rotar `service_role`; borrar las ramas remotas `fase-4-imagenes`, `fase-4-qr` y `fase-4-reservas` si siguen existiendo; probar el QR con un teléfono.

Decisiones abiertas: notificar al comensal (email/WhatsApp), desafío anti-bots, cerrar la RPC pública de solicitudes, CSP, números del cupo con tráfico real, proveedor SMTP.

Fuera de alcance del piloto: pagos (Mercado Pago), WhatsApp automático, métricas comerciales, asignación de mesas.
