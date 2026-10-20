# Reservas del piloto

Fase 4, punto 6. Qué hace el flujo de reservas con un comercio real, qué se le dice al comensal, cómo contacta el
dueño y cómo se protege el formulario público.

## Modelo

Toda solicitud nace **pendiente** y sigue así hasta que el dueño la acepta o la rechaza a mano. Sentate **no promete
disponibilidad de mesas** ni confirma nada solo. Estados: pendiente, confirmada, rechazada y cancelada. El dueño ve el
estado de cada solicitud con una etiqueta (la pendiente muestra «Pendiente»; las otras, su insignia).

## Qué se le dice al comensal

Hoy **no existe ninguna notificación al comensal**: ni email, ni SMS, ni WhatsApp automático, ni pantalla para seguir
el estado. La pantalla de resultado lo dice sin inventar envíos:

- «Todavía no es una reserva: no hay una mesa guardada para vos hasta que el local la confirme».
- «¿Cómo te enterás de la respuesta?»: el local revisa por su cuenta y, si puede recibirlo, se comunica al teléfono que
  dejó (llamada o WhatsApp). «Sentate todavía no envía mensajes ni emails automáticos» y no hay pantalla de estado.
- «Si no tenés novedades, llamá al local», con el teléfono público del local como enlace `tel:`.

El formulario avisa lo mismo antes de enviar. El botón de la carta dice «Solicitá tu mesa · el local la revisa».
**Limitación:** si el dueño no responde, el comensal no se entera de nada. Es una decisión pendiente (ver abajo).

## Contacto manual por WhatsApp (panel)

En cada solicitud, solo en comercios reales (en la demo los teléfonos son ficticios y podrían ser de alguien), hay
**WhatsApp** y **Llamar**. WhatsApp abre `https://wa.me/<número>?text=<mensaje>`: el dueño ve el mensaje y **lo envía
él**. Sentate no envía nada ni marca nada como enviado, y el panel lo dice.

- **El teléfono no está verificado:** lo escribió el comensal. El panel muestra el número exacto al que se va a escribir.
- **El enlace solo se arma cuando el número es inequívoco** (`lib/reservation/contact.ts`): con `+` o `00` y país, o
  un número argentino de 10 dígitos (con o sin 0 de discado), caso en que se asume +54 9 y se avisa «asumimos Argentina».
  Con el «15» de los celulares, de otro país sin `+`, o de largo raro, **no hay enlace** (queda el teléfono y «Llamar»):
  un enlace mal armado escribiría a un desconocido.
- El texto propuesto depende del estado y nunca da por confirmada una solicitud pendiente. El dueño lo edita antes de
  enviar.

## Protección antiabuso: qué había, qué se agregó y qué falta

| Capa | Dónde | Qué frena | Cubre a quien llama a la RPC directo |
|---|---|---|---|
| Formato (nombre, teléfono 8–15 dígitos, notas ≤ 280, 1–8 personas) | Base | Basura | Sí |
| 3 pendientes futuras por teléfono y comercio | Base | Repetir el mismo teléfono | Sí |
| 30 solicitudes por comercio cada 10 min | Base | Inundar el comercio | Sí |
| Idempotencia por clave | Base | Doble envío | Sí |
| **12 solicitudes por conexión cada 10 min y 60 por día (nuevo)** | **Base, consultada por la acción** | **Muchos teléfonos desde una misma conexión** | **No** |

El cupo por conexión es `public.consume_reservation_ip_budget` (migración `20261022000200`):

- **Infraestructura compartida:** contadores en una tabla de la base, que ven todas las instancias del servidor. No es
  un contador en memoria (inútil en serverless).
- **La IP nunca se guarda ni se loguea.** El servidor manda un HMAC-SHA256 con un secreto propio. Sin el secreto no se
  puede apuntar al cupo de una IP ajena. La clave se valida como hexadecimal de 64 caracteres.
- Límites fijos dentro de la función: quien llama no los elige.
- **Falla cerrado:** configuración inválida, header ausente o error de la base devuelven un mensaje y no dejan pasar sin
  límite. En producción sin configurar, el formulario no queda desprotegido en silencio.

### Riesgos residuales (decir la verdad)

1. **Llamada directa a la RPC.** El repositorio es público y la clave publicable también, así que alguien puede llamar a
   `request_reservation` saltándose la acción y omitir el cupo por IP. Sigue valiendo el tope por teléfono y por
   comercio, pero **no hay protección por IP contra eso**. Cerrarlo del todo exige que la RPC no sea pública
   (un rol de servidor o una clave secreta, que este proyecto evita a propósito) o un desafío anti-bots.
2. **El tope de 30 por comercio cada 10 minutos es también una puerta a la denegación de servicio:** 30 solicitudes
   basura bloquean a los comensales reales durante 10 minutos. El cupo por IP lo hace más caro, no imposible.
3. **IP compartida.** Una red móvil con CGNAT o el wifi de un local comparten el cupo: en una hora pico podrían
   bloquear a comensales legítimos. Los números (12 por 10 min, 60 por día) son un compromiso; se ajustan en la migración.
4. **Sin CAPTCHA ni desafío anti-bots.** Un bot paciente con muchas IPs pasa. Un desafío (p. ej. Cloudflare Turnstile)
   necesita una cuenta que no tenemos. Es la mejora de mayor valor pendiente.
5. **El teléfono no se verifica:** alguien puede pedir una mesa con el teléfono de otra persona. Por eso el contacto es
   manual y el panel lo advierte.

### Recomendación de infraestructura (no hecha)

Una regla de rate limiting en **Vercel Firewall** sobre `POST` a `/<slug>` (las Server Actions viajan por ahí) agrega una
capa antes de llegar a la app. Es una acción en el dashboard del usuario; no se hizo desde acá.

## Configuración

| Variable | Valor |
|---|---|
| `RATE_LIMIT_IP_HEADER` | Header con la IP del cliente que **pone tu plataforma y un cliente no puede falsear** |
| `RATE_LIMIT_SECRET` | 32+ caracteres al azar (`openssl rand -hex 32`). Firma la IP |
| `RATE_LIMIT_MODE` | `off` solo para desarrollo local o demo (apagado explícito) |

- **Vercel:** el header es `x-real-ip` o `x-vercel-forwarded-for`. **No lo verifiqué en un despliegue**: confirmalo en
  el primer deploy. No uses `x-forwarded-for` si tu plataforma no lo sobrescribe: un cliente podría falsearlo.
- Sin `RATE_LIMIT_IP_HEADER` + `RATE_LIMIT_SECRET` y sin `RATE_LIMIT_MODE=off`, **en producción** el formulario
  responde «Por ahora no podemos recibir solicitudes desde la web». Es a propósito.
- **Prueba de humo tras el despliegue:** mandá una solicitud desde un celular con datos móviles. Si responde «Por ahora no
  podemos recibir solicitudes», mirá los logs: dicen qué falta (el header, o la configuración) sin escribir la IP.

## Logs

Ningún log de la app escribe contraseñas, tokens, teléfonos, emails ni comentarios de reservas. Los mensajes de error pasan
por `lib/log/redact.ts` (emails, números largos, JWT, claves de Supabase, hex largos). El límite por conexión
nunca recibe la IP ni su hash en el log.

## Acceso público

El público (clave `anon`) no puede leer `reservations` ni los contadores (esquema `private`). Solo puede crear
solicitudes por `request_reservation` y consumir cupo por `consume_reservation_ip_budget`, que solo acepta un HMAC.
La carta pública no incluye datos de quien pidió la mesa. Lo comprueban pgTAP y el E2E.

## Verificación

- `tests/unit/reservas-piloto.test.ts` (59): normalización de teléfonos y casos ambiguos, mensajes, configuración del
  límite, IP y HMAC, compuerta (falla cerrado) y redacción de logs.
- `supabase/tests/database/130_reservation_ip_budget.sql` (pgTAP, 13): cupo de 12, independencia entre claves, claves
  inválidas, tabla ilegible para el público y ventana diaria.
- `tests/e2e-live/reservas-piloto.spec.ts` (Supabase real): texto del resultado, los cuatro estados (la cancelada se fuerza
  por la API del dueño y llega por realtime), enlaces de WhatsApp con y sin número ambiguo, 12 solicitudes pasan y la 13
  se bloquea, otra conexión sigue pudiendo, header ausente, acceso público y 360/390 px con axe.

**No verificado:** el header de IP de Vercel en un despliegue real; el enlace de WhatsApp abriendo la app de WhatsApp en
un teléfono (se comprueba el `href`, no el cliente de WhatsApp); la carga real con muchas conexiones.

## Decisiones pendientes

1. **Notificar al comensal.** Opciones: email al confirmar o rechazar (pide capturar el email y un proveedor SMTP),
   o la API de WhatsApp Business (fuera de alcance, con costo). Hoy: ninguna.
2. **Desafío anti-bots** (Turnstile u otro): requiere una cuenta.
3. **Cerrar la RPC pública** y pasar la solicitud por un rol de servidor, para que el cupo por IP no se pueda saltear.
4. **Ajustar los números del cupo** y el tope de 30 por comercio cuando haya tráfico real.
