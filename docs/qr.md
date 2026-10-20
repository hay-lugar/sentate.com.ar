# QR del comercio

Fase 4, punto 5. En el panel, **QR** (`/admin/<slug>/qr`). El dueño ve y copia el enlace de su carta, descarga el
código en SVG y PNG, e imprime una calcomanía.

## Qué contiene el QR

La **URL canónica de la carta pública**: `<APP_URL>/<slug>`, en minúsculas, sin parámetros ni barra final. Por
ejemplo `https://sentate.com.ar/el-bodegon`. El QR es estático: no hay redirecciones ni seguimiento de escaneos.

El origen sale de `APP_URL`, una variable del **servidor**. Nunca del navegador ni de los headers de la petición, así
que no puede quedar `localhost` por accidente (misma regla que los enlaces de email: `lib/auth/app-url.ts`).

## Origen de piloto y origen de prueba

| `APP_URL` | Qué pasa |
|---|---|
| `https://` + dominio real | Origen **de piloto**. Sin avisos; imprimir habilitado; archivos `qr-<slug>.svg` / `.png` |
| `localhost`, `127.0.0.1` o `http://` | Origen **de prueba**. Aviso visible, imprimir **bloqueado**, y los archivos se llaman `qr-<slug>-prueba.*` para que nadie los imprima por error |
| Falta o es inválida | No se genera nada; se explica qué configurar |

Si la carta **no está publicada**, se avisa que quien escanee verá «no encontrado», con un enlace a Inicio para
publicarla. La advertencia se calcula con el estado real del comercio (`tenants.is_published`).

## Lectura confiable

Las opciones viven en `lib/qr/config.ts` y las comparten el SVG, el PNG y las pruebas.

- **Negro sobre blanco, siempre.** El color del comercio puede bajar el contraste y el lector no escanea.
- **Zona de silencio de 4 módulos**, el mínimo del estándar, incluida en los archivos y medida en las pruebas.
- **Sin logo encima.** Tapar módulos obliga a subir la corrección de errores y baja la tolerancia a impresiones
  gastadas. Nivel de corrección M (15 %).
- **Tamaño.** El PNG es de 1200 px (10 cm a 300 dpi). La calcomanía imprime el QR a **11 cm**; no conviene bajar de
  **8 cm** de lado. El SVG no pierde nitidez a ningún tamaño.
- **Siempre cuadrado.** Si el ancho disponible al imprimir es menor a 11 cm, el QR se achica parejo (`aspect-ratio`) y
  nunca se deforma. Una versión previa se comprimía en horizontal; las pruebas lo detectaron.

## Calcomanía

Hoja A4 con el nombre del local, el QR y el texto **«Escaneá para ver la carta y solicitar una mesa»**, más la URL
sin protocolo. Se arma con CSS de impresión (`print:`): el botón llama a `window.print()` y se oculta todo el panel
(barra lateral, cabecera, navegación inferior, avisos). Recomendaciones que muestra la pantalla: imprimir al 100 %
sin «ajustar a la página», papel claro y mate, sin reflejos, y probar con el celular antes de pegarla.

## Cómo se verificó

Con un **decodificador automatizado** (jsQR), no a ojo:

- `tests/unit/qr.test.ts` (Node): decodifica el **PNG** y el **SVG** reales a la URL canónica, con slugs largos y a
  tamaños chicos. El SVG se rasteriza leyendo su geometría real. También mide la zona de silencio en píxeles y
  comprueba que no lleve `<image>` ni texto encima.
- `tests/e2e/qr.spec.ts` (demo, `APP_URL=https://sentate.com.ar`, escritorio y celular): descarga el SVG y el PNG y
  los decodifica; **emula el medio de impresión**, comprueba que solo quede la calcomanía, que el QR mida al menos
  8 cm, **decodifica el QR de la hoja tal como se imprime** y verifica que entre en **una sola página A4**.
- `tests/e2e-live/qr.spec.ts` (Supabase real, origen de prueba): avisos, bloqueo de impresión, archivos `-prueba`,
  la URL del QR responde 200 con la carta, carta sin publicar (404 real), acceso de otro dueño y 360/390 px.

## Prueba con un teléfono real

**No se hizo.** Nada de lo anterior reemplaza escanear una calcomanía impresa con un celular. Antes del piloto:

1. Con `APP_URL` de producción, descargá el PNG y mandalo a imprimir en el local (papel mate, A4, 100 %).
2. Escaneá la hoja impresa con la cámara de **un iPhone y un Android**, con luz de salón y a ~50 cm.
3. Confirmá que abre `https://sentate.com.ar/<slug>` y muestra la carta.
4. Registrá aparatos y resultado.

## Limitaciones

- **Cambiar el slug invalida los QR impresos.** Hoy el panel no permite editarlo. Si se agrega esa opción, tiene que
  advertirlo antes de guardar.
- El QR no distingue origen del escaneo (no hay UTM). Es una decisión: el enlace es el canónico.
- Con un origen de prueba el dueño puede descargar archivos `-prueba`; solo se impide imprimirlos desde la pantalla.
