import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Imágenes del comercio contra Supabase LOCAL con Storage real. El nombre ordena este archivo DESPUÉS de los demás:
// los platos, logos y portadas que crea no alteran las pruebas existentes de la carta pública.
// Las imágenes se generan en el navegador (canvas): no hay binarios en el repo.

const PASSWORD = "sentate-dev-only";
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const BUCKET = "tenant-images";
const BODEGON_ID = "11111111-1111-4111-8111-111111111111";
const ESQUINA_ID = "22222222-2222-4222-8222-222222222222";
const BODEGON_EMAIL = "owner.bodegon@example.test";
const ESQUINA_EMAIL = "owner.esquina@example.test";

const toast = (page: Page, text: string | RegExp) => page.getByRole("status").or(page.getByRole("alert")).filter({ hasText: text });

async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/.]/g, "\\$&")}$`));
}

/** Imagen generada con canvas: mitad izquierda roja y derecha azul (sirve para comprobar la orientación). */
async function makeImage(page: Page, width: number, height: number, type = "image/png"): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height, type }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#d33";
      ctx.fillRect(0, 0, width / 2, height);
      ctx.fillStyle = "#36c";
      ctx.fillRect(width / 2, 0, width / 2, height);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type, 0.9));
      let binary = "";
      for (const byte of new Uint8Array(await blob.arrayBuffer())) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    { width, height, type },
  );
  return Buffer.from(base64, "base64");
}

/** Inserta un segmento EXIF con la orientación indicada (6 = girar 90° horario) justo después del SOI de un JPEG. */
function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  const exif = Buffer.from([
    0xff, 0xe1, 0x00, 0x22, // APP1, longitud 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF big-endian, IFD0 en el offset 8
    0x00, 0x01, // una entrada
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // 0x0112 Orientation (SHORT)
    0x00, 0x00, 0x00, 0x00, // sin más IFDs
  ]);
  return Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
}

const uploadInto = (scope: Locator) => scope.locator("input[type=file]");

test.describe("imágenes del panel (dueño)", () => {
  test("plato: subir una foto, guardar y verla en la carta pública", async ({ page }) => {
    await login(page, BODEGON_EMAIL, "/admin/prueba-bodegon/menu");
    const name = `Plato con foto ${Date.now()}`;

    await page.getByRole("button", { name: "Plato en Entradas" }).click();
    const sheet = page.getByRole("dialog", { name: "Nuevo plato" });
    await uploadInto(sheet).setInputFiles({ name: "plato.png", mimeType: "image/png", buffer: await makeImage(page, 1600, 1200) });

    const preview = sheet.getByAltText("Foto del plato: vista previa");
    await expect(preview).toBeVisible();
    await expect(sheet.getByRole("alert")).toHaveCount(0);
    // Se optimizó antes de subir: el lado mayor no pasa de 1200 px y mantiene la proporción 4:3.
    const size = await preview.evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }));
    expect(size).toEqual({ w: 1200, h: 900 });

    await sheet.getByLabel("Nombre").fill(name);
    await sheet.getByLabel("Precio (ARS)").fill("9.900");
    await page.getByRole("button", { name: "Agregar plato" }).click();
    await expect(toast(page, `“${name}” agregado`)).toBeVisible();

    // La carta pública recibe una URL firmada del bucket privado y la imagen realmente carga.
    await page.goto("/prueba-bodegon");
    const image = page.getByRole("button", { name: new RegExp(name) }).locator("img").first();
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute("src", /tenant-images/);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test("una foto de celular con orientación EXIF se corrige antes de subir", async ({ page }) => {
    await login(page, BODEGON_EMAIL, "/admin/prueba-bodegon/menu");
    await page.getByRole("button", { name: "Plato en Entradas" }).click();
    const sheet = page.getByRole("dialog", { name: "Nuevo plato" });

    // Archivo 800×400 (apaisado) marcado como "girar 90°": la foto real se ve 400×800 (vertical).
    const jpeg = withExifOrientation(await makeImage(page, 800, 400, "image/jpeg"), 6);
    await uploadInto(sheet).setInputFiles({ name: "foto-celular.jpg", mimeType: "image/jpeg", buffer: jpeg });

    const preview = sheet.getByAltText("Foto del plato: vista previa");
    await expect(preview).toBeVisible();
    const size = await preview.evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }));
    expect(size.h).toBeGreaterThan(size.w);
  });

  test("formatos y tamaños no permitidos se rechazan con un mensaje claro", async ({ page }) => {
    await login(page, BODEGON_EMAIL, "/admin/prueba-bodegon/menu");
    await page.getByRole("button", { name: "Plato en Entradas" }).click();
    const sheet = page.getByRole("dialog", { name: "Nuevo plato" });
    const input = uploadInto(sheet);
    const alert = sheet.getByRole("alert");

    await input.setInputFiles({ name: "dibujo.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>') });
    await expect(alert).toContainText("SVG");

    // Un SVG renombrado a .jpg con el tipo falseado también se detecta por su contenido.
    await input.setInputFiles({ name: "foto.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>") });
    await expect(alert).toContainText("SVG");

    await input.setInputFiles({ name: "chica.png", mimeType: "image/png", buffer: await makeImage(page, 100, 100) });
    await expect(alert).toContainText("320×320");

    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16 * 1024 * 1024)]);
    await input.setInputFiles({ name: "enorme.jpg", mimeType: "image/jpeg", buffer: huge });
    await expect(alert).toContainText("15 MB");

    await expect(sheet.getByAltText("Foto del plato: vista previa")).toHaveCount(0);
  });

  test("sin red: la subida informa el error y se puede reintentar", async ({ page }) => {
    await login(page, BODEGON_EMAIL, "/admin/prueba-bodegon/menu");
    await page.getByRole("button", { name: "Plato en Entradas" }).click();
    const sheet = page.getByRole("dialog", { name: "Nuevo plato" });
    const file = { name: "plato.png", mimeType: "image/png", buffer: await makeImage(page, 800, 600) };

    await page.route(`**/storage/v1/object/${BUCKET}/**`, (route) => route.abort());
    await uploadInto(sheet).setInputFiles(file);
    await expect(sheet.getByRole("alert")).toContainText("Sin conexión");
    await expect(sheet.getByAltText("Foto del plato: vista previa")).toHaveCount(0);

    await page.unroute(`**/storage/v1/object/${BUCKET}/**`);
    await sheet.getByRole("button", { name: "Reintentar" }).click();
    await expect(sheet.getByAltText("Foto del plato: vista previa")).toBeVisible();
    await expect(sheet.getByRole("alert")).toHaveCount(0);
  });

  test("sesión vencida: no sube y pide volver a ingresar", async ({ page, context }) => {
    await login(page, BODEGON_EMAIL, "/admin/prueba-bodegon/menu");
    await page.getByRole("button", { name: "Plato en Entradas" }).click();
    const sheet = page.getByRole("dialog", { name: "Nuevo plato" });
    await context.clearCookies();
    await uploadInto(sheet).setInputFiles({ name: "plato.png", mimeType: "image/png", buffer: await makeImage(page, 800, 600) });
    await expect(sheet.getByRole("alert")).toContainText("sesión venció");
  });

  test("logo: subir, guardar con los ajustes y verlo en el panel", async ({ page }) => {
    await login(page, BODEGON_EMAIL, "/admin/prueba-bodegon/ajustes");
    const group = page.getByRole("group", { name: /Logo/ });
    await uploadInto(group).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: await makeImage(page, 600, 600) });
    await expect(group.getByAltText("Logo: vista previa")).toBeVisible();

    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(toast(page, "Ajustes guardados")).toBeVisible();

    await page.reload();
    await expect(page.getByAltText(/^Logo de /).first()).toHaveAttribute("src", /sign\/tenant-images/);
  });

  test("portada: se guarda al subirla y aparece en la carta pública", async ({ page }) => {
    await login(page, BODEGON_EMAIL, "/admin/prueba-bodegon/ajustes");
    const group = page.getByRole("group", { name: /Portada/ });
    await uploadInto(group).setInputFiles({ name: "portada.png", mimeType: "image/png", buffer: await makeImage(page, 1600, 700) });
    await expect(toast(page, "Portada guardada.")).toBeVisible();

    await page.goto("/prueba-bodegon");
    const cover = page.locator('img[src*="tenant-images"]').first();
    await expect(cover).toBeAttached();
    await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  });
});

test.describe("imágenes: aislamiento entre dos comercios (API de Storage)", () => {
  const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const newPath = (tenantId: string, kind = "dish") => `${tenantId}/${kind}/${crypto.randomUUID()}.webp`;

  async function signedIn(email: string) {
    const client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    expect(error).toBeNull();
    return client;
  }

  test("el dueño de A no puede escribir, leer ni borrar en la carpeta de B", async () => {
    const a = await signedIn(ESQUINA_EMAIL);
    const b = await signedIn(BODEGON_EMAIL);
    const bPath = newPath(BODEGON_ID);

    expect((await b.storage.from(BUCKET).upload(bPath, PNG_1PX, { contentType: "image/png" })).error).toBeNull();

    // A no puede subir a la carpeta de B.
    expect((await a.storage.from(BUCKET).upload(newPath(BODEGON_ID), PNG_1PX, { contentType: "image/png" })).error).not.toBeNull();
    // A no ve el objeto de B: ni firmarlo ni descargarlo.
    expect((await a.storage.from(BUCKET).createSignedUrl(bPath, 60)).error).not.toBeNull();
    expect((await a.storage.from(BUCKET).download(bPath)).error).not.toBeNull();
    // A no puede borrarlo: la operación no afecta ninguna fila y el objeto sigue ahí para B.
    expect((await a.storage.from(BUCKET).remove([bPath])).data ?? []).toHaveLength(0);
    expect((await b.storage.from(BUCKET).download(bPath)).error).toBeNull();

    // A tampoco puede apuntar su logo a una imagen de B.
    const reference = await a.from("tenants").update({ logo_url: bPath.replace("/dish/", "/logo/") }).eq("id", ESQUINA_ID);
    expect(reference.error?.code).toBe("23514");

    await b.storage.from(BUCKET).remove([bPath]);
  });

  test("sin sesión no se puede firmar ni leer una imagen que ninguna carta publica", async () => {
    const b = await signedIn(BODEGON_EMAIL);
    const privatePath = newPath(BODEGON_ID);
    expect((await b.storage.from(BUCKET).upload(privatePath, PNG_1PX, { contentType: "image/png" })).error).toBeNull();

    const anon = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    expect((await anon.storage.from(BUCKET).createSignedUrl(privatePath, 60)).error).not.toBeNull();
    // El bucket es privado: la URL pública no sirve el archivo.
    expect((await fetch(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${privatePath}`)).ok).toBe(false);

    await b.storage.from(BUCKET).remove([privatePath]);
  });

  test("el bucket rechaza SVG y archivos de más de 2 MB", async () => {
    const b = await signedIn(BODEGON_EMAIL);
    const svg = await b.storage.from(BUCKET).upload(newPath(BODEGON_ID), Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), { contentType: "image/svg+xml" });
    expect(svg.error).not.toBeNull();
    const big = await b.storage.from(BUCKET).upload(newPath(BODEGON_ID), Buffer.alloc(2 * 1024 * 1024 + 1), { contentType: "image/png" });
    expect(big.error).not.toBeNull();
  });
});

test.describe("subida de imágenes en el celular", () => {
  for (const width of [360, 390]) {
    test(`${width}px: el formulario de plato con foto no desborda, el botón se toca bien y pasa a11y`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await login(page, BODEGON_EMAIL, "/admin/prueba-bodegon/menu");
      await page.getByRole("button", { name: "Plato en Entradas" }).click();
      const sheet = page.getByRole("dialog", { name: "Nuevo plato" });
      await uploadInto(sheet).setInputFiles({ name: "plato.png", mimeType: "image/png", buffer: await makeImage(page, 800, 600) });
      await expect(sheet.getByAltText("Foto del plato: vista previa")).toBeVisible();

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const button = await sheet.getByText("Reemplazar foto del plato").boundingBox();
      expect(button?.height ?? 0).toBeGreaterThanOrEqual(44);

      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === "finished" || a.playState === "idle"));
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
      await ctx.close();
    });
  }
});
