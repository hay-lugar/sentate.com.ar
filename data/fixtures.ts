// FIXTURES de la demo: locales, cartas, reservas y métricas FICTICIAS.
// Los nombres de clientes y teléfonos son inventados. No importar desde
// componentes: usar las consultas de `lib/data/tenants.ts`.

import type { TenantRecord } from "@/lib/domain/types";
import { DEFAULT_TIMEZONE } from "@/lib/time/zoned";
import { weeklySchedule } from "@/lib/domain/schedule";

const img = (id: string) => `https://images.unsplash.com/photo-${id}`;

export const TENANT_FIXTURES: TenantRecord[] = [
  {
    slug: "el-bodegon",
    profile: {
      name: "El Bodegón",
      tagline: "Parrilla de barrio desde 1987",
      cuisine: "Parrilla argentina",
      priceRange: "$$",
      address: "Av. Corrientes 4120, Almagro",
      phone: "+54 11 0000-0101",
      coverImage: img("1555939594-58d7cb561ad1"),
      theme: {
        primary: "#b8461b",
        primaryForeground: "#ffffff",
        accent: "#f7e6d4",
        accentForeground: "#6b2a10",
      },
      timezone: DEFAULT_TIMEZONE,
      // Cerrado los lunes; el domingo solo almuerzo (horarios distintos por día).
      schedule: {
        week: [
          [{ id: "d0-almuerzo", label: "Almuerzo", open: "12:00", close: "16:30" }],
          [],
          ...[2, 3, 4, 5, 6].map((d) => [
            { id: `d${d}-almuerzo`, label: "Almuerzo", open: "12:00", close: "16:00" },
            { id: `d${d}-cena`, label: "Cena", open: "20:00", close: "00:30" },
          ]),
        ],
        closures: [],
      },
    },
    categories: [
      {
        id: "entradas",
        name: "Entradas",
        dishes: [
          {
            id: "provoleta",
            name: "Provoleta a la parrilla",
            description: "Provolone hilado, orégano, ají molido y aceite de oliva. Para compartir.",
            price: 9800,
            tags: ["veggie", "popular"],
            active: true,
          },
          {
            id: "empanadas",
            name: "Empanadas de carne cortada a cuchillo",
            description: "Masa casera, horno de barro. Porción de 3 con salsa criolla.",
            price: 7200,
            tags: [],
            active: true,
          },
          {
            id: "albondigas",
            name: "Albóndigas de la abuela",
            description: "En salsa de tomate lenta, con pan de campo tostado para mojar.",
            price: 10500,
            image: img("1529042410759-befb1204b468"),
            tags: [],
            active: true,
          },
          {
            id: "papas-parmesano",
            name: "Papas fritas con parmesano",
            description: "Corte bastón, doble cocción, parmesano y perejil fresco.",
            price: 6900,
            image: img("1573080496219-bb080dd4f877"),
            tags: ["veggie", "sin-tacc"],
            active: true,
          },
        ],
      },
      {
        id: "parrilla",
        name: "Parrilla",
        dishes: [
          {
            id: "ojo-de-bife",
            name: "Ojo de bife 400g",
            description: "Madurado 21 días, a punto del chef. Con papas rústicas y chimichurri.",
            price: 26500,
            image: img("1594041680534-e8c8cdebd659"),
            tags: ["popular", "sin-tacc"],
            active: true,
          },
          {
            id: "entrana",
            name: "Entraña fina",
            description: "Jugosa, crocante por fuera. Acompañá con ensalada o fritas.",
            price: 22900,
            image: img("1558030006-450675393462"),
            tags: ["sin-tacc"],
            active: true,
          },
          {
            id: "vacio",
            name: "Vacío de novillo",
            description: "Cocción lenta a leña de quebracho, 4 horas. Se deshace solo.",
            price: 21500,
            image: img("1529692236671-f1f6cf9683ba"),
            tags: [],
            active: true,
          },
          {
            id: "costillar",
            name: "Costillar ahumado",
            description: "Glaseado con barbacoa de la casa y batatas asadas.",
            price: 24800,
            image: img("1544025162-d76694265947"),
            tags: ["nuevo"],
            active: true,
          },
          {
            id: "bondiola",
            name: "Bondiola braseada",
            description: "Con manzanas caramelizadas, mostaza antigua y verdes.",
            price: 19900,
            image: img("1432139555190-58524dae6a55"),
            tags: [],
            active: false,
          },
        ],
      },
      {
        id: "pastas",
        name: "Pastas",
        dishes: [
          {
            id: "tagliatelle",
            name: "Tagliatelle al ragú",
            description: "Pasta al huevo amasada a mano, ragú de osobuco y parmesano.",
            price: 15800,
            image: img("1551183053-bf91a1d81141"),
            tags: [],
            active: true,
          },
          {
            id: "penne",
            name: "Penne arrabbiata",
            description: "Tomate San Marzano, ajo y peperoncino. Picante en serio.",
            price: 13200,
            image: img("1621996346565-e3dbc646d9a9"),
            tags: ["veggie", "picante"],
            active: true,
          },
          {
            id: "risotto",
            name: "Risotto de hongos",
            description: "Carnaroli, hongos de pino, manteca y parmesano 24 meses.",
            price: 16400,
            image: img("1476124369491-e7addf5db371"),
            tags: ["veggie", "sin-tacc"],
            active: true,
          },
        ],
      },
      {
        id: "postres",
        name: "Postres",
        dishes: [
          {
            id: "flan",
            name: "Flan casero mixto",
            description: "Con dulce de leche y crema. El de siempre.",
            price: 6500,
            tags: ["popular"],
            active: true,
          },
          {
            id: "tiramisu",
            name: "Tiramisú",
            description: "Mascarpone, café de especialidad y cacao amargo.",
            price: 7900,
            image: img("1571877227200-a0d98ea607e9"),
            tags: [],
            active: true,
          },
          {
            id: "brownie",
            name: "Brownie tibio",
            description: "Chocolate 70%, nueces y bocha de helado de crema americana.",
            price: 7400,
            image: img("1606313564200-e75d5e30476c"),
            tags: [],
            active: true,
          },
          {
            id: "panna-cotta",
            name: "Panna cotta de frutillas",
            description: "Vainilla de Madagascar y coulis de frutos rojos.",
            price: 6900,
            image: img("1488477181946-6428a0291777"),
            tags: ["sin-tacc"],
            active: true,
          },
        ],
      },
      {
        id: "bebidas",
        name: "Bebidas",
        dishes: [
          {
            id: "malbec",
            name: "Copa de Malbec",
            description: "Valle de Uco, Mendoza. Botella disponible a $24.000.",
            price: 6200,
            image: img("1437418747212-8d9709afab22"),
            tags: [],
            active: true,
          },
          {
            id: "pinta",
            name: "Pinta de cerveza tirada",
            description: "Rubia, roja o IPA de cervecería artesanal local.",
            price: 4800,
            image: img("1535958636474-b021ee887b13"),
            tags: [],
            active: true,
          },
          {
            id: "limonada",
            name: "Limonada con menta y jengibre",
            description: "Jarra de 1 litro, para compartir.",
            price: 5200,
            tags: ["veggie"],
            active: true,
          },
          {
            id: "agua",
            name: "Agua con o sin gas",
            description: "500 ml.",
            price: 2500,
            tags: [],
            active: true,
          },
        ],
      },
    ],
    reservations: [
      { id: "r-101", name: "Martina Gómez", phone: "+54 11 0000-0201", guests: 4, dayOffset: 0, time: "21:30", notes: "Cumpleaños, si se puede mesa cerca de la ventana 🎂", status: "pending", receivedMinutesAgo: 6 },
      { id: "r-102", name: "Lucas Fernández", phone: "+54 11 0000-0202", guests: 2, dayOffset: 0, time: "20:45", status: "pending", receivedMinutesAgo: 18 },
      { id: "r-103", name: "Familia Rossi", phone: "+54 11 0000-0203", guests: 7, dayOffset: 0, time: "13:00", notes: "Venimos con un cochecito de bebé.", status: "confirmed", receivedMinutesAgo: 340 },
      { id: "r-104", name: "Sofía Herrera", phone: "+54 11 0000-0204", guests: 3, dayOffset: 0, time: "22:00", status: "confirmed", receivedMinutesAgo: 95 },
      { id: "r-105", name: "Julián Paz", phone: "+54 11 0000-0205", guests: 2, dayOffset: 1, time: "21:00", notes: "Celíaco, necesitamos opciones sin TACC.", status: "pending", receivedMinutesAgo: 42 },
      { id: "r-106", name: "Camila Ortiz", phone: "+54 11 0000-0206", guests: 6, dayOffset: 1, time: "21:30", status: "pending", receivedMinutesAgo: 75 },
      { id: "r-107", name: "Tomás Medina", phone: "+54 11 0000-0207", guests: 2, dayOffset: 2, time: "13:30", status: "pending", receivedMinutesAgo: 130 },
      { id: "r-108", name: "Valentina Ruiz", phone: "+54 11 0000-0208", guests: 5, dayOffset: 0, time: "14:00", status: "rejected", receivedMinutesAgo: 410 },
    ],
    stats: {
      menuViewsLast7: [312, 288, 401, 376, 455, 620, 702],
      menuViewsPrev7Total: 2610,
    },
  },
  {
    slug: "la-esquina",
    profile: {
      name: "La Esquina",
      tagline: "Burgers, pizzas y tragos hasta tarde",
      cuisine: "Bar & cocina",
      priceRange: "$$",
      address: "Thames 1650, Palermo",
      phone: "+54 11 0000-0102",
      coverImage: img("1514933651103-005eec06c04b"),
      theme: {
        primary: "#0f766e",
        primaryForeground: "#ffffff",
        accent: "#d9f2ec",
        accentForeground: "#0b4d47",
      },
      timezone: DEFAULT_TIMEZONE,
      schedule: weeklySchedule([0, 1, 2, 3, 4, 5, 6], [{ id: "noche", label: "Noche", open: "18:00", close: "03:00" }]),
    },
    categories: [
      {
        id: "compartir",
        name: "Para compartir",
        dishes: [
          { id: "fritas", name: "Fritas cheddar & bacon", description: "Cheddar fundido, bacon crocante y verdeo.", price: 8900, image: img("1573080496219-bb080dd4f877"), tags: ["popular"], active: true },
          { id: "tostado", name: "Tostado de jamón crudo", description: "Pan de masa madre, crudo, rúcula y queso tybo.", price: 7600, image: img("1528735602780-2552fd46c7af"), tags: [], active: true },
        ],
      },
      {
        id: "burgers",
        name: "Burgers",
        dishes: [
          { id: "doble-smash", name: "Doble smash", description: "Dos medallones smasheados, cheddar, pickles y salsa de la casa.", price: 13900, image: img("1607013251379-e6eecfffe234"), tags: ["popular"], active: true },
          { id: "clasica", name: "Clásica", description: "Medallón 180g, lechuga, tomate, cebolla morada y alioli.", price: 11900, image: img("1586190848861-99aa4a171e90"), tags: [], active: true },
        ],
      },
      {
        id: "pizzas",
        name: "Pizzas",
        dishes: [
          { id: "margherita", name: "Margherita napolitana", description: "Fior di latte, albahaca y tomate San Marzano. Masa 48hs.", price: 12500, image: img("1574071318508-1cdbab80d002"), tags: ["veggie"], active: true },
          { id: "pepperoni", name: "Pepperoni & hot honey", description: "Mozzarella, pepperoni y miel picante.", price: 14200, image: img("1565299624946-b28f40a0ae38"), tags: ["picante", "nuevo"], active: true },
        ],
      },
      {
        id: "tragos",
        name: "Tragos",
        dishes: [
          { id: "old-fashioned", name: "Old Fashioned", description: "Bourbon, bitter de angostura y naranja.", price: 8200, image: img("1470337458703-46ad1756a187"), tags: [], active: true },
          { id: "mojito", name: "Mojito de maracuyá", description: "Ron blanco, maracuyá, menta y lima.", price: 7400, image: img("1551024709-8f23befc6f87"), tags: ["popular"], active: true },
          { id: "negroni", name: "Negroni de la casa", description: "Gin, Campari y vermut rosso infusionado.", price: 7900, image: img("1514362545857-3bc16c4c7d1b"), tags: [], active: true },
        ],
      },
      {
        id: "postres",
        name: "Postres",
        dishes: [
          { id: "shake", name: "Freakshake de Oreo", description: "Helado, Oreo, crema y salsa de chocolate.", price: 6900, image: img("1563805042-7684c019e1cb"), tags: [], active: true },
        ],
      },
    ],
    reservations: [
      { id: "r-201", name: "Nicolás Vega", phone: "+54 11 0000-0209", guests: 8, dayOffset: 0, time: "22:30", notes: "Despedida de soltero.", status: "pending", receivedMinutesAgo: 12 },
      { id: "r-202", name: "Agustina Luna", phone: "+54 11 0000-0210", guests: 2, dayOffset: 0, time: "20:00", status: "confirmed", receivedMinutesAgo: 200 },
      { id: "r-203", name: "Bruno Castro", phone: "+54 11 0000-0211", guests: 4, dayOffset: 1, time: "21:00", status: "pending", receivedMinutesAgo: 55 },
      // Turno posterior a medianoche: servicio de hoy, fecha calendario de mañana.
      { id: "r-204", name: "Delfina Sosa", phone: "+54 11 0000-0212", guests: 3, dayOffset: 0, time: "01:00", notes: "Venimos después del teatro.", status: "pending", receivedMinutesAgo: 25 },
    ],
    stats: {
      menuViewsLast7: [520, 480, 610, 590, 880, 1240, 1102],
      menuViewsPrev7Total: 5030,
    },
  },
  {
    slug: "sakura",
    profile: {
      name: "Sakura",
      tagline: "Nikkei & sushi de autor",
      cuisine: "Japonesa · Nikkei",
      priceRange: "$$$",
      address: "Gorriti 5870, Palermo Hollywood",
      phone: "+54 11 0000-0103",
      coverImage: img("1579871494447-9811cf80d66c"),
      theme: {
        primary: "#be123c",
        primaryForeground: "#ffffff",
        accent: "#fde4ea",
        accentForeground: "#881337",
      },
      timezone: DEFAULT_TIMEZONE,
      schedule: weeklySchedule([1, 2, 3, 4, 5, 6], [{ id: "cena", label: "Cena", open: "19:30", close: "00:00" }]),
    },
    categories: [
      {
        id: "rolls",
        name: "Rolls",
        dishes: [
          { id: "philadelphia", name: "Philadelphia roll", description: "Salmón, queso crema y palta. 10 piezas.", price: 15800, image: img("1579871494447-9811cf80d66c"), tags: ["popular"], active: true },
          { id: "combinado", name: "Barco Sakura (30 piezas)", description: "Selección del chef: rolls, niguiris y sashimi.", price: 42000, image: img("1553621042-f6e147245754"), tags: [], active: true },
        ],
      },
      {
        id: "bowls",
        name: "Bowls",
        dishes: [
          { id: "poke", name: "Poke de salmón", description: "Arroz de sushi, salmón, edamame, mango y sésamo.", price: 14900, image: img("1546069901-ba9599a7e63c"), tags: ["sin-tacc"], active: true },
          { id: "veggie-bowl", name: "Bowl verde", description: "Mix de hojas, tofu grillado y aderezo de miso.", price: 11900, image: img("1540189549336-e6e99c3679fe"), tags: ["veggie"], active: true },
        ],
      },
      {
        id: "especiales",
        name: "Especiales del chef",
        dishes: [
          // Caso de texto largo sin imagen.
          { id: "omakase", name: "Omakase de temporada con selección de pescados de estación y tamago casero", description: "Diez pasos definidos por el chef según la pesca del día. Consultá restricciones alimentarias antes de pedir: algunas preparaciones llevan salsa de soja con trigo, sésamo y mariscos crudos.", price: 68000, tags: ["nuevo"], active: true },
          // Caso de imagen que no carga: la UI debe mostrar el fallback.
          { id: "gyozas", name: "Gyozas de cerdo", description: "Seis piezas a la plancha con salsa ponzu.", price: 9800, image: img("0000000000000-000000000000"), tags: [], active: true },
        ],
      },
      { id: "postres", name: "Postres", dishes: [] },
    ],
    reservations: [
      { id: "r-301", name: "Kenji Arakaki", phone: "+54 11 0000-0213", guests: 2, dayOffset: 0, time: "21:00", status: "pending", receivedMinutesAgo: 9 },
    ],
    stats: {
      menuViewsLast7: [140, 168, 155, 190, 240, 330, 298],
      menuViewsPrev7Total: 1390,
    },
  },
];
