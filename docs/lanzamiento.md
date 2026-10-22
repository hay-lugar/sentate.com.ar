# Lista de lanzamiento (acciones del dueño del proyecto)

Todo esto requiere tus cuentas (Supabase, Vercel, proveedores) y **no lo puede hacer el código ni el asistente**. Ordenado por prioridad. Marcá cada punto cuando lo termines.

## 1. Seguridad (antes de abrir a comercios reales)
- [ ] **Rotar la `service_role` de Supabase.** Supabase → Project Settings → API Keys → regenerar. La app no la usa (solo usa la clave publicable); rotarla es higiene porque pasó por herramientas de trabajo. Después de rotar, verificá que `/explorar` y el ingreso siguen andando.
- [ ] **Quitar variables privilegiadas de Vercel.** Vercel → Project → Settings → Environment Variables: dejar solo `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y las opcionales documentadas en `.env.example`. No debe haber `SERVICE_ROLE`, tokens de acceso ni contraseñas de base. Redesplegar después.
- [ ] **Verificación en dos pasos** en Supabase, Vercel y GitHub, y como máximo dos superadmins (ver `docs/superadmin.md`).
- [ ] **Backups.** Supabase → Database → Backups. Confirmar qué plan tenés (los backups diarios y la recuperación a un punto en el tiempo dependen del plan) y hacer una prueba de restauración en un proyecto aparte.

## 2. Autenticación (Supabase → Authentication)
- [ ] **URL Configuration:** *Site URL* = el dominio definitivo; en *Redirect URLs* agregar `https://<dominio>/auth/callback` y el de la vista previa si la usás. Sin esto fallan la confirmación de email y la recuperación de contraseña.
- [ ] **SMTP propio** (Authentication → SMTP Settings). El servicio por defecto de Supabase tiene límites muy bajos y no sirve para producción. Hace falta un proveedor con dominio verificado (SPF/DKIM).
- [ ] **Plantillas de email** (confirmación y recuperación) en castellano, con el nombre definitivo de la marca. Ver `docs/auth-recuperacion.md`.
- [ ] **Google / Apple** (opcional): crear las credenciales OAuth en cada proveedor y cargarlas en Authentication → Providers. Ver `docs/auth-oauth.md`. Hasta entonces los botones no se muestran.

## 3. Dominio y marca
- [ ] **Dominio:** Vercel → Domains → agregar `sentate.com.ar` (o el definitivo) y ajustar DNS. Poner `APP_URL` con ese origen.
- [ ] **Nombre definitivo.** Hoy la marca visible es `{Sin Nombre}`, definida en `lib/config/brand.ts`. Cambiarla es una decisión comercial tuya; el código ya lo centraliza.
- [ ] **Protección de Vercel:** hoy el proyecto tiene SSO activado para los despliegues que no son de dominio propio. Con dominio propio la web pública queda abierta; revisá qué querés proteger.

## 4. Servicios opcionales (se activan solos al cargar la variable)
- [ ] **Mapas de búsqueda por dirección:** `GEOAPIFY_API_KEY` (sin ella, el pin se ubica a mano).
- [ ] **Avisos por email a comensales:** elegir proveedor, verificar el dominio, cargar `NOTIFICATIONS_*` y el hash del secreto. Ver `docs/notificaciones.md`. Hasta entonces no se envía nada.
- [ ] **Mercado Pago:** hoy solo se registran eventos. Para cobrar falta trabajo de desarrollo con credenciales de sandbox. Ver `docs/pagos.md`. **No hay cobros reales sin tu autorización explícita.**

## 5. Primera puesta en marcha
- [ ] Entrar a `/superadmin` con tu cuenta, crear un comercio de prueba, completar el perfil con ubicación, enviarlo a revisión, aprobarlo y publicarlo.
- [ ] Verlo en `/explorar`, ponerle una promoción y reservar una mesa de prueba.
- [ ] Borrar el comercio de prueba desde la ficha (escribiendo su slug) cuando termines.

## 6. Decisiones comerciales que siguen abiertas
Nombre definitivo, política de moderación y de destacados, qué pasa con la carta cuando vence la prueba (hoy se puede cambiar en Superadmin → Sistema), qué cobrar y desde cuándo, y si se ofrece WhatsApp además del email.
