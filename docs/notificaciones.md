# Notificaciones por email

Estado: **base implementada, sin proveedor activo**. Nada se envía a nadie hasta que se configure y se habilite explícitamente.

## Diseño
- `private.notification_outbox`: cola idempotente (`unique (reservation_id, kind, channel)`), con intentos, `next_attempt_at` con retroceso y `provider_message_id`.
- Un trigger sobre `public.reservations` encola «recibida», «confirmada», «rechazada» y «cancelada por el local». Solo si hay email **y** consentimiento (`notify_consent`); sin consentimiento el email ni se guarda.
- Los avisos llevan datos mínimos (nombre de pila, local, fecha, personas): ni teléfono ni email en el payload.
- Worker: `POST /api/notificaciones/despachar` con el secreto en cabecera. El secreto nunca se guarda en claro: la base conserva su `sha256` (`private.settings.notification_worker_secret_sha256`) y las RPC `claim_notifications` / `complete_notification` lo verifican. No usa `service_role`.
- Proveedor: abstracción en `lib/notifications/provider.ts`, deshabilitado por defecto. Un aviso se marca `sent` únicamente cuando el proveedor confirma; los fallos transitorios reintentan, los definitivos quedan `failed`.
- La reserva no depende del envío.

## Cuándo se avisa
Recibida, confirmada, rechazada, cancelada por el local y, desde el PR4, **vencida sin respuesta** (la solicitud pasó su plazo y no quedó ninguna mesa reservada). Siempre solo con email y consentimiento, y una sola vez por reserva y tipo.

## Programador («cron»)
`.github/workflows/avisos.yml` llama cada 10 minutos a `POST /api/notificaciones/despachar`. **Sin configurar no hace nada.** No se usó `vercel.json` a propósito: los cron de Vercel en el plan gratuito son diarios y una configuración inválida puede hacer fallar el despliegue. Para activarlo: en GitHub → Settings → Secrets and variables → Actions, la variable `APP_URL` (`https://<dominio>`) y el secreto `NOTIFICATIONS_WORKER_SECRET` (el mismo de Vercel). Los workflows programados corren solo desde `main`.

## Habilitar (acción del dueño del proyecto)
1. Elegir proveedor y verificar el dominio emisor.
2. Variables en Vercel (ver `.env.example`): `NOTIFICATIONS_PROVIDER`, `NOTIFICATIONS_FROM`, `NOTIFICATIONS_WORKER_SECRET` (32+ caracteres) y la clave del proveedor.
3. Guardar el hash del secreto: `update private.settings set notification_worker_secret_sha256 = encode(extensions.digest('<secreto>', 'sha256'), 'hex');`
4. Programar la llamada periódica (cron) al endpoint.
5. Probar con una reserva propia antes de abrirlo a comercios piloto.
