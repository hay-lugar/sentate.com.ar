// Marca visible de la plataforma: única fuente de verdad.
//
// «{Sin Nombre}» es un nombre TEMPORAL, con las llaves incluidas, hasta que se decida el definitivo. Cambiarlo acá cambia
// la marca en la landing, el acceso, el panel, los títulos, los textos de producto y los nombres accesibles.
//
// Lo que NO sale de esta configuración y no cambia con el nombre: el dominio (sentate.com.ar), el repositorio, los
// slugs, los identificadores de Supabase, las cookies y las claves de almacenamiento. Tampoco los nombres ni logos de
// los comercios: la carta de cada local muestra los suyos.
export const BRAND = {
  name: "{Sin Nombre}",
} as const;

/** Título de página con la marca como sufijo: «Ingresar · {Sin Nombre}». */
export const withBrand = (title: string) => `${title} · ${BRAND.name}`;
