// Marca visible de la plataforma: única fuente de verdad.
//
// «{Sin Nombre}» es un nombre TEMPORAL, con las llaves incluidas, hasta que se decida el definitivo. Cambiarlo acá cambia
// la marca en la landing, el acceso, el panel, los títulos, los textos de producto y los nombres accesibles.
//
// Lo que NO sale de esta configuración y no cambia con el nombre: el dominio (sentate.com.ar), el repositorio, los
// slugs, los identificadores de Supabase, las cookies y las claves de almacenamiento. Tampoco los nombres ni logos de
// los comercios: la carta de cada local muestra los suyos.
export const BRAND = {
  /** Nombre comercial completo (con las llaves mientras sea temporal). */
  name: "{Sin Nombre}",
  /** Nombre corto para espacios chicos (pestañas, manifest). */
  shortName: "{Sin Nombre}",
  /** Eslogan. Vacío a propósito: no hay uno aprobado y no se inventa. */
  tagline: "",
  /** Descripción para buscadores y redes (meta description por defecto). */
  description: "Descubrí dónde comer, mirá la carta de cada local y pedí tu mesa. Y para tu negocio: carta digital con QR, reservas opcionales y un panel.",
  /** Título por defecto de la landing. */
  defaultTitle: "Descubrí dónde comer, cartas digitales y reservas",
  /** Color de la barra del navegador (la interfaz es neutra; cada carta usa el color de su local). */
  themeColor: "#ffffff",
  /** Símbolo vectorial (public/marca). */
  symbolPath: "/marca/cubiertos.svg",
  /**
   * Contacto comercial y redes. null = no configurado: la interfaz NO muestra el enlace.
   * Se completan cuando existan los canales reales (no se publican datos inventados).
   */
  contact: { email: null as string | null, whatsapp: null as string | null },
  social: { instagram: null as string | null, facebook: null as string | null, linkedin: null as string | null },
} as const;

/** Título de página con la marca como sufijo: «Ingresar · {Sin Nombre}». */
export const withBrand = (title: string) => `${title} · ${BRAND.name}`;
