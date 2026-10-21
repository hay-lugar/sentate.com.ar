# Sistema visual

Base neutra (blanco, tinta y grises), tipografía de sistema y componentes compartidos. La identidad sale del logo: cubiertos negros y lettering en mayúsculas, sobre blanco.

## Tokens (`app/globals.css`)

| Token | Uso |
|---|---|
| `--background`, `--surface` | Fondo y superficies (blanco) |
| `--subtle` | Bandas y avisos neutros (`#f5f5f7`) |
| `--foreground`, `--muted` | Texto y texto secundario (≥ 4.5:1 sobre blanco y sobre `--subtle`) |
| `--line`, `--line-strong`, `--field` | Divisores, bordes de controles, borde de campos (≥ 3:1) |
| `--brand`, `--brand-fg`, `--accent`, `--accent-fg` | **Slots del comercio.** Valen la tinta de Sentate salvo dentro de la carta, donde `themeStyle()` los reemplaza por los colores guardados del comercio |
| `--danger`, `--success`, `--warning` | Estados; siempre acompañados de texto |

Radios (`rounded-lg` 8 px … `rounded-3xl` 16 px), sombras (solo `shadow-lift` para sheets) y fuentes (`font-sans`/`font-display`, ambas del sistema) también son tokens. No hay fuentes externas.

## Componentes

- `components/ui/button.tsx`: `Button` y `buttonClass()` (también para `<Link>`). Variantes `primary`, `secondary`, `quiet`, `danger`; tamaños `sm`/`md`/`lg`.
- `components/menu/reservation/controls.tsx`: `inputClass`, `Chip`, `FieldError` (campos y selectores).
- `components/ui/bottom-sheet.tsx`: sheets y diálogos.
- `components/ui/logo.tsx`: logo (`public/sentate.svg`, recortado al contenido, sin deformar) en `sm` (panel), `md` (barra) y `lg` (ingreso y 404).

## Reglas

1. **El comercio manda en su carta; Sentate manda en lo demás.** La carta pública usa los colores guardados del comercio. Landing, ingreso y panel usan la base neutra; el color del comercio aparece en el panel solo en su propio logo (cuando no subió uno) y en la vista previa de Ajustes.
2. Sin degradados, halos, brillos ni animaciones continuas. El movimiento explica una interacción (abrir un sheet, cambiar de paso) y respeta `prefers-reduced-motion`. Ningún contenido depende de una animación para verse.
3. Los estados se dicen con texto (Pendiente, Reserva confirmada, Abierto…), nunca solo con color.
4. Sin eslóganes ni métricas inventadas. El precio y la prueba gratuita se muestran una vez en la landing, desde `lib/config/plan.ts`.
5. Superficies separadas por divisores y bordes finos, no por tarjetas con sombra.

`tests/e2e/rediseno.spec.ts` comprueba estas reglas en el producto renderizado.

## Capturas de la landing

`public/producto/*.webp` son capturas reales de la demo. Al cambiar la interfaz: `npm run build && npx next start -p 3600` y `node scripts/landing-shots.mjs`. `node scripts/shots.mjs <carpeta>` toma todas las pantallas a 360/390/768/1440 px para revisión visual (usa `sharp`, que Next instala como dependencia opcional).
