# Auditoría visual (Fase 2)

## Método
- `node scripts/audit-visual.mjs <carpeta> [baseUrl]` (con la app en marcha): recorre 13 páginas de la demo en 360, 390, 768 y 1440 px, recorre cada página para cargar imágenes diferidas, captura a página completa y mide en el DOM: desborde horizontal, áreas táctiles < 44 px, texto < 13 px, imágenes sin `alt`, un solo `h1` y un solo `main`. Escribe `reporte.json`.
- Las pantallas que requieren datos reales (explorador con comercios, panel con capacidad, superadmin, cuenta) se revisaron con las capturas que sube el CI (`capturas`, de `tests/e2e-live/capturas.spec.ts`) contra Supabase local con fixtures.
- Las capturas se revisaron una por una a ojo en las pantallas principales (landing, carta, panel, explorador); el resto solo con las mediciones automáticas.

## Resultado de las mediciones (antes → después)
52 combinaciones página × ancho. Sin desborde horizontal, sin imágenes sin `alt`, un `h1` y un `main` en todas.

| Hallazgo | Antes | Después |
|---|---|---|
| Casillas del panel de filtros (explorador, escritorio) de 14–17 px por encogerse en flex | sí | corregido (`shrink-0`, 20 px) |
| Botones de zoom del mapa 29 px | sí | 44 px (CSS de `.maplibregl-ctrl-group`) |
| Entrada de archivo oculta (1×1) marcada como táctil pequeña | falso positivo | excluida de la medición |
| Atribución del mapa (12 px, enlaces de 15 px de alto) | sí | **sin cambio**: texto de atribución exigido por OpenFreeMap/OSM |

## Hallazgos visuales corregidos
- Explorador sin comercios: «Tipo de comercio» y «Cocina» aparecían como títulos vacíos; ahora se ocultan si no hay opciones.
- Mapa: el contador «N en esta vista» quedaba tapado por la atribución y, en celular, el botón «Mi ubicación» también; reubicados.
- Explorador en celular: el placeholder del buscador se cortaba («Local, plato o :»); ahora «Local o plato».

## Observaciones sin cambios (decisión consciente)
- Las capturas a página completa muestran la barra inferior del panel y la barra «Solicitar mesa» de la carta en mitad de la página: es un efecto de la captura (elementos fijos), no un defecto.
- En la landing, las imágenes de «Así se ve» cargan diferidas; una captura que no recorre la página las muestra en blanco.
- La portada del panel en escritorio deja mucho espacio a la derecha en pantallas de configuración: es legible y consistente; rediseñarlo no está justificado por evidencia.

## Límites
Contraste de color solo a ojo (no se midió con herramienta); no se probó con lector de pantalla; los tiles del mapa en las capturas locales dependen de red a OpenFreeMap.
