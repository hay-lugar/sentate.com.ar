# Sistema visual

Base neutra (blanco, tinta y grises), tipografía de sistema y componentes compartidos.

## Marca visible (temporal)

El nombre visible de la plataforma es **«{Sin Nombre}»** (con llaves) hasta que se decida el definitivo. Sale de **una sola configuración**, `lib/config/brand.ts` (`BRAND.name`, `withBrand()`), y de ahí la toman la landing, el acceso, el panel, los títulos y metadatos, los textos de producto y los nombres accesibles.

- Identidad: el símbolo de los cubiertos (`public/marca/cubiertos.svg`, vector propio sin texto, trazado del dibujo original) más el nombre como wordmark tipográfico (`components/ui/logo.tsx`: `sm` panel, `md` barra, `lg` acceso). Una vez por pantalla.
- **No cambia con el nombre:** dominio (`sentate.com.ar`), repositorio, slugs, identificadores de Supabase, cookies, claves de almacenamiento ni los nombres técnicos internos. Tampoco los nombres y logos de los comercios.
- Fuera del código, el nombre está escrito en: el asunto (`supabase/config.toml`) y el `<h2>` de `supabase/templates/recovery.html`, y en el dashboard de Supabase (plantilla y asunto remotos, acción del titular). Ver `docs/auth-recuperacion.md`.
- `tests/e2e/marca.spec.ts` comprueba que no quede ninguna mención visible al nombre anterior (texto, nombres accesibles, título y metadatos), salvo URLs.

## Tokens (`app/globals.css`)

| Token | Uso |
|---|---|
| `--background`, `--surface` | Fondo y superficies (blanco) |
| `--subtle` | Bandas y avisos neutros (`#f5f5f7`) |
| `--foreground`, `--muted` | Texto y texto secundario (≥ 4.5:1 sobre blanco y sobre `--subtle`) |
| `--line`, `--line-strong`, `--field` | Divisores, bordes de controles, borde de campos (≥ 3:1) |
| `--brand`, `--brand-fg`, `--accent`, `--accent-fg` | **Slots del comercio.** Valen la tinta de Sentate salvo dentro de la carta, donde `themeStyle()` los reemplaza por los colores guardados del comercio |
| `--danger`, `--success`, `--warning` | Estados; siempre acompañados de texto |

## Escala tipográfica

Seis utilidades en `app/globals.css`: `type-display` (landing), `type-title` (título de página), `type-heading` (título de pantalla de una columna y de resultados), `type-section` (secciones), `type-label` (etiquetas de campo) y `type-help` (ayudas). Cuerpo 15–16 px. Las negritas quedan para los títulos; los nombres y etiquetas van en medium. Ningún texto baja de 13 px. Horas, precios y cantidades usan cifras tabulares.

## Interacción

Todo control mide al menos 44 × 44 px (los interruptores y los íconos tienen el área táctil completa aunque el dibujo sea menor). Estados: normal, hover, foco visible, presionado (`pressable`), deshabilitado, cargando (`Button pending`) y error. El viewport usa `interactive-widget=resizes-content`: con el teclado abierto, las barras y botones fijos quedan sobre el teclado.

Radios al estilo de iOS (`rounded-lg` 10 px, `rounded-xl` 14 px para controles, `rounded-2xl` 18 px para tarjetas y listas, `rounded-3xl` 24 px para hojas), sombras (solo `shadow-lift` para sheets) y fuentes (`font-sans`/`font-display`, ambas del sistema) también son tokens. No hay fuentes externas.

## Componentes

- `components/ui/button.tsx`: `Button` y `buttonClass()` (también para `<Link>`). Variantes `primary`, `secondary`, `quiet`, `danger`; tamaños `sm`/`md`/`lg`.
- `components/menu/reservation/controls.tsx`: `inputClass`, `Chip`, `FieldError` (campos y selectores).
- `components/ui/bottom-sheet.tsx`: sheets y diálogos.
- `components/ui/logo.tsx`: símbolo + wordmark (ver «Marca visible») en `sm` (panel), `md` (barra) y `lg` (ingreso y 404).

## Reglas

1. **El comercio manda en su carta; Sentate manda en lo demás.** La carta pública usa los colores guardados del comercio. Landing, ingreso y panel usan la base neutra; el color del comercio aparece en el panel solo en su propio logo (cuando no subió uno) y en la vista previa de Ajustes.
2. Sin degradados, halos, brillos ni animaciones continuas (el desenfoque de las barras es estático). El movimiento explica una interacción (abrir un sheet, cambiar de paso) y respeta `prefers-reduced-motion`. Ningún contenido depende de una animación para verse.
3. Los estados se dicen con texto (Pendiente, Reserva confirmada, Abierto…), nunca solo con color.
4. Sin eslóganes ni métricas inventadas. El precio y la prueba gratuita se muestran una vez en la landing, desde `lib/config/plan.ts`.
5. Superficies separadas por divisores y bordes finos (`border-line/70`), no por tarjetas con sombra.
6. **Barras fijas translúcidas** (`bar-blur`): navegación, pestañas de la carta, barra inferior del panel y barras de acción desenfocan lo que pasa por detrás, como en iOS; sin soporte de `backdrop-filter` queda el fondo sólido.
7. **Feedback al tocar** (`pressable`): el control se hunde un 3 % (`scale(.97)`) y recupera su tamaño con la curva `--ease-spring`; con movimiento reducido no hay transición.
8. Títulos grandes y compactos: `type-display` 44→68 px en peso 700 con tracking −0,04 em; `type-title` 32 px en peso 700.

9. **Modo oscuro** (sigue al sistema, `prefers-color-scheme`). Las superficies pasan a negro (`--background`), gris elevado (`--surface`/`--subtle`) y texto `#f5f5f7`; los tokens de la plataforma (`--brand`, `--accent`) se invierten. **Convivencia con el comercio:** la carta de cada comercio conserva SUS colores de marca como rellenos (botones, selecciones, logo-inicial) con un filo claro en oscuro para que un color muy oscuro no desaparezca; el fondo y el texto base sí se adaptan. No se oscurecen ni invierten las fotos. El mapa usa el estilo oscuro de OpenFreeMap. Al imprimir (QR) siempre es claro. Verificado con axe (contraste incluido) en `tests/e2e/oscuro-y-texto.spec.ts`.
10. **Tipografía dinámica:** todos los tamaños de texto están en `rem` (no hay `text-[Npx]`), así que escalan con el tamaño de texto del navegador y del sistema; en Safari (iOS/macOS) la base sigue `font: -apple-system-body`, o sea el tamaño de texto que la persona eligió en Ajustes. Sin desborde horizontal a 360 px con el texto al 140 % (prueba E2E).
11. **Transición entre páginas:** un fundido de 260 ms al navegar (`app/template.tsx`), no en la primera carga; solo opacidad (sin `transform`, para no mover las barras fijas) y desactivado con movimiento reducido.
12. **Mosaicos** (landing): «Para negocios», «Así se ve» y «Precio» van en mosaicos redondeados de `--subtle` con titular centrado y la captura recortada por el borde, como una página de producto de Apple. La ficha del local en la carta tiene acciones rápidas (Llamar, Cómo llegar, Compartir) y un bloque agrupado con dirección, teléfono y horarios; las tarjetas del explorador llevan la foto arriba; Lista/Mapa es un control segmentado.

Límites conocidos: la base `font: -apple-system-body` solo se probó en Chromium (sin efecto); en Safari real la base es 17 px. No se probó en un iPhone.

`tests/e2e/rediseno.spec.ts` comprueba estas reglas en el producto renderizado.

## Capturas de la landing

`public/producto/*.webp` son capturas reales de la demo. Al cambiar la interfaz: `npm run build && npx next start -p 3600` y `node scripts/landing-shots.mjs`. `node scripts/shots.mjs <carpeta>` toma todas las pantallas a 360/390/768/1440 px para revisión visual (usa `sharp`, que Next instala como dependencia opcional).
