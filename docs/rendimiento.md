# Rendimiento (Lighthouse)

## Cómo se midió
Build de producción local (`npm run build && npm run start`), Lighthouse 12 con el Chromium de Playwright, emulación de celular (4x de CPU más lenta y red lenta, la configuración por defecto) y las páginas de la **demo** (sin base de datos). Una sola corrida por página: hay variación de unos puntos entre corridas. No se midió contra producción ni con datos reales; las imágenes de la demo vienen de Unsplash.

```
npm i lighthouse@12 (fuera del repo)
CHROME_PATH=<chromium> lighthouse http://localhost:3600/<ruta> --only-categories=performance --chrome-flags="--headless=new --no-sandbox"
```

## Antes → después (rendimiento en celular)
| Página | Antes | Después | Bloqueo del hilo (TBT) |
|---|---|---|---|
| Landing `/` | 89 | 99 | 440 ms → 50 ms |
| Carta `/el-bodegon` | **56** | **88** | 2.720 ms → 150 ms |
| Explorador `/explorar` | 95 | 96 | 90 ms → 50 ms |
| Panel `/admin/el-bodegon` | 98 | 95 | 50 ms → 60 ms (dentro de la variación) |

En escritorio todas daban 92–100 antes del cambio. Accesibilidad 100 y buenas prácticas 96–100 en todas; SEO 100 en las páginas indexables (la carta demo y el panel son `noindex` a propósito, por eso marcan menos).

## Qué se cambió y por qué
La carta ejecutaba ~2,6 s de JavaScript en celular lento: cargaba al entrar `framer-motion` (por la barra compacta y por una configuración global) y las hojas de plato y de pedido de mesa, que solo se usan al tocar. Ahora:
- La barra compacta usa solo CSS.
- La hoja de plato y el flujo de reserva se descargan la primera vez que se abren.
- `framer-motion` ya no es global: lo cargan solo las hojas y el panel.

## Pendiente / no medido
- Mediciones contra producción con comercios reales (la base remota está vacía).
- LCP de la carta en celular sigue en ~3,8 s por la foto de portada (imagen remota de la demo); con las imágenes del Storage firmadas habrá que volver a medir.
- El explorador carga MapLibre (~800 KB) de forma diferida; no se optimizó más.
