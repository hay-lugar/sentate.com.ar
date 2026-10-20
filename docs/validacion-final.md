# Validación final del piloto (Fase 4, punto 8)

Qué se comprueba, con qué prueba y dónde corre. Lo que **no** se pudo verificar está al final: leerlo antes de abrir el piloto.

## Cómo se corre

| Dónde | Qué | Comando |
|---|---|---|
| Local, sin Docker | Instalación limpia, typecheck, lint, unitarias, build, E2E demo | `npx -y npm@11 ci && npm run check && npm run test:e2e` |
| CI (job 1) | Lo mismo, en cada PR y en `main` | `.github/workflows/ci.yml` |
| CI (job 2) | Supabase local: `db lint`, pgTAP, Data API, Realtime, Storage y E2E live | ver `ci.yml` |

pgTAP, Data API, Realtime, Storage y las E2E live **requieren Docker** (Supabase local) y solo corren en CI; el resultado válido es el del CI sobre el commit final de `main`.

## Matriz

| Requisito | Prueba | Dónde |
|---|---|---|
| Instalación reproducible | `npm ci` desde un clon limpio de `main` | local + CI |
| Typecheck / lint / unitarias / build | `npm run check` (281 unitarias) | local + CI |
| RLS, permisos, reglas de negocio | pgTAP `010`–`130` | CI |
| Data API y Realtime reales | `supabase/tests/api/*.test.mjs` | CI |
| Storage (bucket privado, aislamiento) | pgTAP `120`, `tests/e2e-live/storage-imagenes.spec.ts` | CI |
| Registro → confirmación de email → alta → carta → horarios → publicación | `live.spec.ts` «recorrido completo del dueño» | CI |
| Recuperación de contraseña | `recuperacion.spec.ts` (flujo, enlace reusado/vencido, OTP inesperado) | CI |
| Imágenes | `storage-imagenes.spec.ts` (subida, EXIF, rechazos, sin red, sesión vencida) | CI |
| QR | `qr.spec.ts` (demo y live) y `tests/unit/qr.test.ts`; el QR se decodifica | local + CI |
| Reservas (estados, WhatsApp manual, cupo por conexión, realtime) | `reservas-piloto.spec.ts`, `live.spec.ts` «reservas en vivo», pgTAP `070`/`090`/`130` | CI |
| Aislamiento entre dos dueños | pgTAP `030`, `live.spec.ts` «otro dueño», Storage entre comercios, QR ajeno | CI |
| Prueba vencida | pgTAP `060`, `live.spec.ts` «prueba vencida» | CI |
| Sesión vencida, sin red, reintentos | `live.spec.ts` «errores y estados», `storage-imagenes.spec.ts`, `reservation-sync.test.ts` | CI + local |
| Accesibilidad (axe, serias/críticas) y desborde a 360/390 px y escritorio | demo: `demo.spec.ts`, `qr.spec.ts`; live: panel, login, recuperación, QR, reservas, imágenes, y carta pública real + alta + recuperar (este punto) | local + CI |
| Cabeceras, `robots.txt`, `noindex` | `tests/e2e/despliegue.spec.ts` | local + CI |
| Config del piloto, secretos, fixtures, logs | `preflight.test.ts`, `repo-hygiene.test.ts` | local + CI |

## Dependencias

`npm audit --omit=dev`: 0 vulnerabilidades en producción. `npm audit` completo: 5 avisos *high* de `braces`, solo en la cadena de desarrollo (`eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch`); no llegan al servidor ni al navegador, y el arreglo propuesto (`--force`) es un cambio mayor, no aplicado.

## Lo que NO está verificado

- **Nada se probó en `sentate.com.ar`** ni en Vercel: no hay proyecto desplegado. Faltan la prueba de humo de `docs/piloto.md`, el header de IP de Vercel y el envío real de emails (SMTP).
- **Migraciones remotas:** `20261022000100` y `20261022000200` no están aplicadas en el Supabase remoto; todo lo anterior se probó contra Supabase **local**.
- **Teléfono real:** el QR se decodifica por software y el enlace de WhatsApp se comprueba por su `href`; no se escaneó ni se abrió WhatsApp en un teléfono.
- **A11y:** axe detecta solo una parte de los problemas; no hubo prueba con lector de pantalla ni auditoría manual.
- **Carga y denegación de servicio:** el cupo por conexión se probó funcionalmente, no con tráfico; riesgos residuales en `docs/reservas-piloto.md`.
- **Flakiness:** una E2E live de realtime (reservas, estado «Cancelada») falló una vez en CI y pasó al reintentar sin cambios; la causa no se investigó.
