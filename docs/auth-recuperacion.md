# Autenticación: recuperación de contraseña y enlaces de email

Flujo implementado en Fase 4 (punto 3). Usa el flujo recomendado de Supabase para SSR con
`token_hash` + `verifyOtp`: el enlace funciona aunque se abra en otro navegador o dispositivo.

## Flujo

1. `/login` → "Olvidé mi contraseña" → `/recuperar`.
2. `requestPasswordResetAction` llama a `resetPasswordForEmail(email, { redirectTo })`, con
   `redirectTo = {APP_URL}/auth/callback?next=/recuperar/nueva`. La respuesta es **neutral**: el mismo
   mensaje exista o no la cuenta. El botón queda deshabilitado 60 s para evitar envíos repetidos.
3. El email usa la plantilla `recovery` (`supabase/templates/recovery.html`), que apunta a
   `{SiteURL}/auth/callback?token_hash=…&type=recovery&next=/recuperar/nueva`.
4. `/auth/callback` canjea el `token_hash` con `verifyOtp` (o el `code` de PKCE, si llega así).
   - Válido: crea la sesión y redirige a `/recuperar/nueva`.
   - Vencido, inválido o ya usado: redirige a `/recuperar?error=enlace` con un mensaje en `role="alert"`.
   - Tipo no previsto (solo `recovery` y `signup`): se rechaza.
5. `/recuperar/nueva` valida la sesión con `getUser()` (verificación contra Auth, no solo el JWT).
   Sin sesión, no muestra el formulario. Con sesión, `setNewPasswordAction` valida la clave en el
   servidor (mínimo 8 caracteres, máximo 72 bytes, confirmación igual) y llama a `updateUser`.

## Origen de los enlaces

Los enlaces de email **no** usan los headers `origin` o `host` del request. Salen de `APP_URL`
(`lib/auth/app-url.ts`): solo origen, `https` salvo `http://localhost` fuera de producción, sin ruta
ni credenciales. Si `APP_URL` falta o es inválida, el alta y la recuperación muestran un error genérico
y no envían nada.

## Variables de entorno

| Variable | Dónde | Valor |
|---|---|---|
| `APP_URL` | Servidor (Vercel y local) | Producción: `https://sentate.com.ar` · Local: `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente y servidor | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Cliente y servidor | Clave publicable. Nunca `service_role` |

## Configuración de Supabase (proyecto remoto `Sentate`)

Estos pasos los hace el usuario en el dashboard. No se aplicaron desde el repo.

- **Authentication → URL Configuration**
  - Site URL: `https://sentate.com.ar` (igual a `APP_URL`; el enlace de recuperación usa `{{ .SiteURL }}`).
  - Redirect URLs: agregar `https://sentate.com.ar/auth/callback` (pendiente desde Fase 3.1).
    Para previews, agregar también su origen `https://<preview>/auth/callback`.
- **Authentication → Email Templates → Reset password**
  - Pegar el contenido de `supabase/templates/recovery.html`.
  - Asunto: `Recuperá tu contraseña de Sentate`.
  - El enlace debe usar `{{ .TokenHash }}` (no `{{ .ConfirmationURL }}`), porque el callback espera `token_hash`.
- **Authentication → Providers → Email → Minimum password length**: `8` (en `supabase/config.toml` ya está en 8).
- **Authentication → Rate limits**: el envío de emails de recuperación está limitado por proyecto.

## Proveedor de email

El SMTP integrado de Supabase tiene un cupo bajo por hora y no está pensado para producción. Para el
piloto conviene configurar un SMTP propio (**decisión pendiente del usuario**: proveedor y dominio de
envío, con SPF y DKIM en `sentate.com.ar`). Sin eso, los emails de alta y recuperación pueden no llegar
o caer en spam.

## Local: Supabase CLI + Mailpit

- `supabase start` levanta Mailpit en `http://127.0.0.1:54324`. Todos los emails se leen ahí.
- `supabase/config.toml`: `site_url = http://localhost:3000`, plantilla `recovery` apuntando a `token_hash`.
- Pruebas E2E: `npm run test:e2e:live` corre `tests/e2e-live/recuperacion.spec.ts`. Usa el usuario
  `recuperacion@example.test` (sin comercio) de `supabase/seed.sql`, así que cambiar su clave no afecta a
  los demás tests. Cubre: respuesta neutral, flujo completo, enlace reutilizado, enlace inválido, tipo
  no previsto, sesión ausente, reglas de contraseña y accesibilidad.

## Lo que no hace

- No revela si una cuenta existe, ni por la respuesta ni por el tiempo de respuesta. El tiempo no se
  igualó entre cuentas existentes e inexistentes: queda como limitación conocida.
- No cierra otras sesiones abiertas al cambiar la clave.
