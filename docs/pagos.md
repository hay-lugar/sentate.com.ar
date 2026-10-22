# Pagos (Mercado Pago)

Estado: **solo recepción de notificaciones**. No se cobra, no se crean suscripciones en Mercado Pago y **no se activa ni se cambia ninguna suscripción** a partir de un pago. El precio publicado ($14.999 ARS/mes, 30 días sin tarjeta) no cambia.

## Qué existe
- `POST /api/pagos/mercadopago`: verifica la firma `x-signature` (HMAC-SHA256 del manifiesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, con tolerancia de 10 minutos contra repeticiones) y registra el evento. Sin `MERCADOPAGO_WEBHOOK_SECRET` y `PAYMENTS_WORKER_SECRET` responde 503.
- `private.payment_events` + `public.record_payment_event(...)`: guarda cada evento **una sola vez** (único por proveedor + clave) y solo lo mínimo (sin datos personales; payload con tope de 16 KB). Se autentica con un secreto cuyo `sha256` está en `private.settings.payment_worker_secret_sha256`; no usa `service_role`.
- Pruebas: firma (`tests/unit/mercadopago-firma.test.ts`) y base de datos (pgTAP `240_eventos_de_pago.sql`: secreto, idempotencia, proveedores, tope de tamaño, sin lectura pública).

## Qué falta (no hacer pasar por hecho)
1. Credenciales de **sandbox** y una suscripción de prueba en Mercado Pago.
2. Procesar los eventos: consultar el recurso (`data.id`) en la API del proveedor, mapear estados (autorizada, pausada, cancelada, rechazada) y recién entonces actualizar `tenant_subscriptions` (`status`, `current_period_ends_at`). Hoy el estado de un evento queda en `received`.
3. Reconciliación periódica contra la API (por si se pierde un webhook) y manejo del período de gracia.
4. Pantalla de «Activar suscripción» en el panel y la decisión comercial de qué pasa al vencer la prueba.
5. Probar de punta a punta en sandbox **antes** de cualquier cobro real. Los cobros reales requieren autorización explícita.

## Habilitar la recepción (acción del dueño del proyecto)
1. En Mercado Pago, configurar el webhook hacia `https://<dominio>/api/pagos/mercadopago` y copiar su secreto.
2. Variables en Vercel: `MERCADOPAGO_WEBHOOK_SECRET`, `PAYMENTS_WORKER_SECRET` (32+ caracteres).
3. Guardar el hash: `update private.settings set payment_worker_secret_sha256 = encode(extensions.digest('<PAYMENTS_WORKER_SECRET>', 'sha256'), 'hex');`
