// Modelo comercial: única fuente de verdad para precio, moneda y prueba.

export const PLAN = {
  name: "Sentate",
  priceMonthly: 5500,
  currency: "ARS",
  trialDays: 30,
  trialRequiresCard: false,
} as const;

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: PLAN.currency,
  maximumFractionDigits: 0,
});

/** "$ 5.500" */
export const planPriceLabel = money.format(PLAN.priceMonthly);
/** "30 días gratis" */
export const trialLabel = `${PLAN.trialDays} días gratis`;
/** "30 días gratis, sin tarjeta" */
export const trialLongLabel = `${trialLabel}${PLAN.trialRequiresCard ? "" : ", sin tarjeta"}`;
