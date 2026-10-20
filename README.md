# Sentate — frontend (Fase 1.1, demo con datos de ejemplo)

Menú digital y pedidos de mesa para locales gastronómicos. Esta fase es **solo frontend**:
no hay base de datos, autenticación, pagos, email ni WhatsApp. Todo funciona con datos
ficticios (`data/fixtures.ts`).

- Prueba: **30 días sin tarjeta**. Precio: **$5.500 ARS por mes**. Fuente única: `lib/config/plan.ts`.

## Requisitos

- Node.js ≥ 20.9 (probado con 22.22)
- npm (el lockfile se generó con npm 11; `npm ci` funciona con npm 10 y 11)

## Ejecutar

```bash
npm ci            # instalación reproducible desde package-lock.json
npm run dev       # http://localhost:3000
# o en modo producción:
npm run build && npm start
```

## Rutas de la demo

| Ruta | Qué es |
| --- | --- |
| `/` | Landing para dueños de locales |
| `/el-bodegon`, `/la-esquina`, `/sakura` | Menú público de cada local de ejemplo |
| `/admin/el-bodegon` (y los otros slugs) | Panel del local: inicio, reservas, carta y ajustes |
| `/cualquier-otro-slug` | 404 (el slug se resuelve en el servidor) |

Locales de ejemplo útiles para probar casos borde:

- **La Esquina** abre 18:00–03:00 todos los días: horarios después de medianoche.
- **El Bodegón** tiene almuerzo y cena (20:00–00:30) y cierra los lunes.
- **Sakura** cierra los domingos, tiene un plato con nombre largo sin imagen, una imagen rota
  (para ver el fallback; el servidor registra un 404 de esa imagen, es esperado) y una categoría vacía.

## Comprobaciones

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint (eslint-config-next: core-web-vitals + typescript)
npm test            # Vitest: horarios, validación de reserva, aislamiento por tenant, carta, contraste
npm run build
npm run check       # todo lo anterior en orden

# E2E (Playwright). Requiere build previo; levanta `next start` en el puerto 3100.
npx playwright install chromium   # una vez, si no tenés el navegador
npm run test:e2e
# Con un Chromium ya instalado:
PW_CHROMIUM_PATH=/ruta/a/chrome npm run test:e2e
```

Las E2E cubren: 404 de slugs inválidos, foco/contención/Escape/restauración del bottom sheet,
CSS vars del tenant dentro del portal, reserva simulada y error simulado, aislamiento de cambios
entre tenants + "Restablecer demo", alta de plato reflejada en el menú público, nombres accesibles
de controles y ausencia de scroll horizontal a 360/390/768 px (proyectos mobile y desktop).

## Simular carga y errores

El envío de reservas y el formulario de la landing simulan una petición de red:

| Mecanismo | Efecto |
| --- | --- |
| `?simular=error` en la URL (ej. `/sakura?simular=error`) | La operación falla y se muestra el estado de error con "Reintentar" |
| `?simular=lento` | Demora 4 s (para ver el estado de carga y probar cerrar el sheet a mitad de envío) |
| `NEXT_PUBLIC_DEMO_SIMULATE=error\|lento` al levantar la app | Igual, para toda la app (el query param tiene prioridad) |

Implementación: `lib/demo/simulate.ts`. La petición simulada es cancelable: al cerrar el sheet o
desmontar el componente se aborta y se limpia el temporizador. No hay envío doble.

## Qué es real y qué es simulado

- **Reserva del comensal**: produce una *solicitud simulada*. No se envía al comercio, no se guarda
  y el resultado lo dice explícitamente. En el producto real una solicitud queda **pendiente** hasta que
  el local la acepta; recién ahí es una **reserva confirmada**.
- **Disponibilidad de horarios**: ficticia (hash determinístico, `lib/reservation/availability.ts`).
- **Panel**: reservas, clientes y métricas son de ejemplo. Confirmar/Rechazar cambia el estado en memoria
  (se pierde al recargar).
- **Carta y Ajustes del panel**: se guardan en `localStorage` de este navegador, aislados por tenant
  (`sentate:demo:v1:<slug>`) y versionados. Nunca se guardan reservas, nombres, teléfonos ni comentarios.
  El menú público de ese mismo navegador aplica los cambios al cargar. **No hay sincronización entre
  pestañas ni persistencia en servidor.** "Restablecer demo" (banner del panel) borra los cambios del tenant.
- **Formulario de email de la landing**: no guarda ni envía nada, y lo informa.

## Fechas y horarios

- Cada comercio tiene una zona horaria (`profile.timezone`, default `America/Argentina/Buenos_Aires`).
  Estado abierto/cerrado, calendario y validación usan esa zona, no la del servidor ni la del dispositivo.
- Un horario pertenece a la **fecha de servicio** en que abrió su turno. En un turno 20:00–00:30 que abre
  el viernes, las 00:15 son del servicio del viernes aunque la **fecha calendario** sea el sábado. No hay
  cortes arbitrarios por hora.
- Al enviar se revalidan todos los campos, la fecha, el horario y que el turno no haya pasado
  (anticipación mínima de 30 min).
- Limitación: las comparaciones usan hora de reloj del comercio; para zonas con horario de verano el
  día del cambio de hora puede desplazar 1 h. Argentina no tiene horario de verano.

## Arquitectura

```
app/                      Páginas (Server Components). Resuelven el slug y llaman a notFound().
lib/domain/types.ts       Tipos de dominio (TenantRecord privado, PublicTenant público).
lib/domain/public.ts      Proyección al contrato público con lista PERMITIDA de campos.
lib/domain/schedule.ts    Turnos, fecha de servicio vs. calendario, abierto/cerrado.
lib/time/zoned.ts         "Ahora" en la zona del comercio y aritmética de fechas sin TZ local.
lib/reservation/          Validación pura y disponibilidad ficticia.
lib/data/tenants.ts       Consultas (hoy sobre fixtures; en Fase 2, Supabase).
lib/demo/                 Estado de demo: reducer puro, storage versionado, simulación, validaciones de formularios.
lib/config/plan.ts        Precio, moneda y duración de la prueba.
data/fixtures.ts          Datos ficticios. Solo los importa lib/data.
components/               UI. Reciben datos y callbacks; no consultan fixtures.
tests/unit, tests/e2e     Vitest y Playwright.
```

Accesibilidad: el bottom sheet (`components/ui/bottom-sheet.tsx`) enfoca el primer control, contiene
Tab/Shift+Tab, cierra con Escape o el fondo, deja el resto de la página `inert` y devuelve el foco al
disparador; se monta en un portal y conserva las CSS vars del tenant vía `ThemeScope`. Framer Motion y el
CSS respetan `prefers-reduced-motion` (también el scroll entre categorías). Los tres temas cumplen
contraste AA (4.5:1) en sus pares de texto; Ajustes muestra el contraste en vivo y bloquea combinaciones
insuficientes.

## Limitaciones conocidas

- Sin backend: nada se envía ni se persiste fuera del navegador.
- La hidratación desde `localStorage` ocurre después del primer render: si hay cambios guardados, se ven
  los datos de ejemplo por un instante antes de aplicarse.
- `npm audit` reporta un aviso *high* en `braces` (vía `eslint-config-next` → `fast-glob`), solo en
  dependencias de desarrollo; no hay versión corregida compatible al momento.
- El logo subido se guarda como data URL (máx. 200 KB) en `localStorage`.
