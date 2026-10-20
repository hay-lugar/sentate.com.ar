# Imágenes del comercio (Supabase Storage)

Fase 4, punto 4. El dueño sube desde el celular el **logo**, la **portada** y las **fotos de los platos**.

## Diseño

- **Bucket `tenant-images`, privado.** Lo crea la migración `20261022000100_tenant_images_storage.sql`:
  máximo 2 MiB por archivo y solo `image/webp`, `image/jpeg` e `image/png`. SVG y otros formatos activos o
  animados no entran.
- **Ruta:** `<tenant_id>/<logo|cover|dish>/<uuid>.<webp|jpg>`. El UUID es nuevo en cada subida: dos subidas nunca
  colisionan ni se pisan. Cada comercio tiene su carpeta.
- **Las columnas guardan la ruta**, no una URL ni un data URL (`tenants.logo_url`, `tenants.cover_url`,
  `menu_items.image_url`). Las URLs `https` de las demos siguen aceptándose. La base exige que el prefijo de la
  ruta sea el `id` de la propia fila: un dueño no puede apuntar su logo a una imagen de otro comercio.

## Quién puede qué (políticas de `storage.objects`)

| Operación | Quién | Condición |
|---|---|---|
| Subir (`insert`) | Dueño | `can_operate(<tenant de la ruta>)`: miembro con acceso operativo (prueba vigente o plan) |
| Borrar (`delete`) | Dueño | Igual que subir |
| Leer, miembro | Miembros del comercio | `is_tenant_member(<tenant de la ruta>)` |
| Leer, público | Visitante anónimo | Solo si la imagen la referencia un comercio visible (logo o portada) o un plato **disponible** en una categoría **visible** de un comercio visible |

Una ruta con formato inválido nunca concede acceso. No hay política de `update`: no se sobrescribe nada.
No se usa `service_role` en el navegador ni en el servidor para imágenes.

## Cómo se ve una imagen

- **Carta pública:** el servidor firma URLs de lectura (`createSignedUrls`, 1 hora) con la sesión anónima del
  visitante. RLS decide qué rutas puede firmar, así que solo salen las imágenes de la carta visible
  (`lib/images/sign.ts`, aplicado en `getLivePublicTenant`). Una ruta que no se puede firmar se muestra sin
  imagen; la carta no se rompe.
- **Panel:** el navegador firma la ruta con la sesión del dueño (`lib/images/use-storage-url.ts`, con caché).
- **`next/image`** solo acepta las demos (`images.unsplash.com`) y el Storage de este proyecto: el patrón sale de
  `NEXT_PUBLIC_SUPABASE_URL` y se limita a `/storage/v1/object/sign/tenant-images/**` (`next.config.ts`). Solo si
  Supabase es local (`localhost` o `127.0.0.1`) se habilita `dangerouslyAllowLocalIP`, que Next bloquea por defecto.

## Qué pasa al elegir una foto (`lib/images/prepare.ts`)

1. **Valida el contenido real**, no la extensión ni el tipo que informa el navegador: JPEG, PNG o WebP por sus
   primeros bytes. Un SVG renombrado a `.jpg` se rechaza. También GIF, HEIC y cualquier otro formato.
2. **Límites:** hasta 15 MB de origen y 50 megapíxeles. Mínimo 128×128 (logo), 640×320 (portada), 320×320 (plato).
3. **Decodifica respetando la orientación EXIF** (las fotos del celular suelen venir "acostadas").
4. **Achica sin agrandar:** lado mayor de 512 px (logo), 1600 px (portada) o 1200 px (plato).
5. **Vuelve a codificar** en WebP (JPEG si el navegador no codifica WebP). Esto descarta los metadatos EXIF,
   incluida la ubicación GPS. Si pesa más de 2 MB baja la calidad en pasos; si no alcanza, avisa.
6. **Sube con progreso** (`lib/images/upload.ts`, XHR) con la sesión del dueño. Errores con mensaje:
   sin conexión (con **Reintentar** sin volver a elegir el archivo), sesión vencida, sin permiso, demasiado pesada.

El campo (`components/admin/image-uploader.tsx`) muestra vista previa, progreso, errores con `role="alert"`,
**Reemplazar** y **Quitar**, y los límites. Los controles miden al menos 44 px de alto.

## Guardado, reemplazo y huérfanos

- **La imagen anterior se conserva** hasta que el guardado nuevo se confirma: subir no cambia ninguna fila.
  - Plato y logo: la ruta viaja con el guardado del plato o de Ajustes.
  - Portada: tiene su propia mutación (`saveCover`) con control de versión; se guarda al terminar la subida.
- Una imagen reemplazada, quitada o subida y no guardada queda **huérfana**. `tenant_image_orphans(tenant)`
  las lista: son los objetos del comercio que ninguna fila referencia y que tienen **más de 1 hora**. La acción
  `sweepOrphanImagesAction` las borra con la sesión del dueño, después de cada subida o de quitar una imagen.
  Nunca toca una imagen referenciada ni una subida de la última hora.

## Pruebas

- `tests/unit/images.test.ts`: firma real del archivo (SVG disfrazado, GIF, HEIC), límites, escalado, rutas,
  aislamiento por comercio, contrato de mutaciones y resolución de URLs.
- `supabase/tests/database/120_tenant_images.sql` (pgTAP): bucket privado y sin SVG, escritura y borrado cruzados
  entre dos dueños, lectura pública acotada a la carta visible, referencias cruzadas rechazadas, huérfanos.
- `tests/e2e-live/storage-imagenes.spec.ts` (Storage real): subir plato, logo y portada y verlos en la carta
  pública; orientación EXIF; rechazo de SVG, SVG con tipo falseado, imágenes chicas y enormes; sin red con
  reintento; sesión vencida; aislamiento entre dos dueños por la API de Storage; 360 y 390 px con axe.

CI levanta `storage-api` (antes estaba excluido de `supabase start`).

## Qué NO se hizo, y limitaciones

- **No se probó con un teléfono real.** Las pruebas de móvil usan viewports de 360 y 390 px en Chromium.
  La cámara y la galería del celular quedan sin verificar.
- **El procesamiento es del lado del cliente.** El servidor impone el tipo MIME y los 2 MiB del bucket, pero no
  re-decodifica la imagen: un dueño que llame a la API directamente puede subir un PNG, JPEG o WebP de hasta 2 MiB
  sin optimizar. No se escanea el contenido.
- **Poco caché de imágenes.** Cada URL firmada lleva un token distinto, así que `next/image` casi no reutiliza
  su caché de imágenes optimizadas. Es aceptable para un piloto; si pesa, la salida es un bucket público con
  nombres no adivinables o un CDN delante.
- **Una imagen subida y no guardada** que el dueño deje más de 1 hora y luego guarde puede haberse limpiado como
  huérfana. En la práctica el formulario no se deja abierto tanto tiempo.
- **HEIC no se acepta.** Los iPhone suelen entregar JPEG cuando el campo pide JPEG, pero no está verificado.
- La migración `20261022000100` **no se aplicó en el proyecto remoto**. Hay que aplicarla antes del piloto:
  crea el bucket y las políticas. No requiere cambios en el dashboard salvo verificar que Storage esté activo.
