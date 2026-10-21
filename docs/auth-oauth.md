# Ingreso con Google y Apple (y cuenta del comensal)

El código está listo; **ningún proveedor está activo** hasta que se configure en el proyecto de Supabase. La pantalla de
ingreso consulta `GET /auth/v1/settings` y muestra solo los botones de proveedores habilitados: sin configurar, no
aparece nada (nunca un botón que no funcione).

## Qué hace falta (acción de quien administra el proyecto)

### Google (gratis)
1. Google Cloud Console → proyecto → *APIs y servicios → Pantalla de consentimiento OAuth* (tipo Externo; datos de la app y
   dominio autorizado `sentate.com.ar`). Para publicar fuera de «pruebas» Google puede pedir verificación de la marca.
2. *Credenciales → ID de cliente OAuth → Aplicación web*. URI de redirección autorizado:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → *Authentication → Providers → Google*: pegar Client ID y Client Secret y habilitar.

### Apple (requiere cuenta paga)
1. **Apple Developer Program: USD 99 por año.** Sin eso no se puede habilitar «Iniciar sesión con Apple».
2. Crear un App ID con «Sign in with Apple», un **Services ID** (será el Client ID) y una **clave `.p8`**.
3. Dominio y *Return URL*: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Supabase → *Providers → Apple*: Services ID + *secret key* (un JWT firmado con la `.p8`). **Ese secreto vence a los 6 meses** y
   hay que regenerarlo.

### En ambos casos
- Supabase → *Authentication → URL Configuration*: *Site URL* = `APP_URL` y agregar `https://sentate.com.ar/auth/callback`
  (y el origen de Vercel si se usa) a *Redirect URLs*.
- Local/CI: los proveedores están deshabilitados en `supabase/config.toml` (los tests verifican que no aparezcan botones).

## Seguridad
- La vuelta pasa por `/auth/callback`, con `next` validado por `safeNext` (solo rutas internas).
- **No se vinculan cuentas por email enviado por el cliente.** Supabase vincula identidades únicamente cuando el proveedor
  informa un email *verificado*; la app no hace vinculación propia.
- Iniciar sesión como comensal **no otorga permisos sobre ningún comercio**: esos salen de `tenant_members`. Una misma
  persona puede ser comensal y dueña con una sola identidad.
- Una cuenta de plataforma (`platform_admins`) o dueña de un local no puede darse de baja desde «Mi cuenta».

## Qué guarda la cuenta del comensal
- `diner_profiles` (nombre y teléfono opcionales, solo visibles para la propia persona), `favorites` (privados) y el vínculo
  `reservations.user_id` (lo pone la base con la sesión validada; nunca el navegador).
- **Solicitudes sin cuenta:** siguen funcionando igual y quedan sin vínculo. **No se asocian reservas viejas por teléfono o
  email escritos** (cualquiera podría reclamar las de otra persona). Reclamar solicitudes de invitado mediante un enlace
  verificable queda *fuera de alcance* por ahora.
- **Estados mostrados:** Pendiente, Confirmada, Rechazada, Cancelada, Finalizada y Sin respuesta. «Finalizada» (confirmada
  que ya pasó) y «Sin respuesta» (pendiente que ya pasó) se *derivan* al leer; no hay un proceso que las escriba. La etapa E
  reemplaza la duración fija de 3 h por la ocupación configurada.
- **Cancelación del comensal:** una solicitud pendiente se retira hasta la hora de la reserva; una confirmada, hasta
  `tenants.diner_cancel_cutoff_hours` horas antes (por defecto 2; hoy se cambia por SQL, la pantalla del comercio llega con la
  etapa E/F). Pasado ese plazo, se le indica comunicarse con el local. La cancelación llega al panel del comercio por el
  Realtime existente.
- **Baja de cuenta:** borra la identidad, el perfil y los favoritos. Las reservas quedan en cada local (con el nombre y teléfono
  que la persona escribió) pero sin vínculo. **Pendiente de verificar en el proyecto remoto:** que el rol `postgres` pueda borrar
  de `auth.users` desde una función `SECURITY DEFINER` (se probó solo en el stack local). Antes de aplicar la migración al remoto
  hay que comprobarlo en una cuenta descartable.
