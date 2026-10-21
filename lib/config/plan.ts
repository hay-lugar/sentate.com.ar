// Modelo comercial: única fuente de verdad para precio, moneda y prueba.

import { BRAND } from "./brand";

export const PLAN = {
  name: BRAND.name,
  priceMonthly: 14999,
  currency: "ARS",
  trialDays: 30,
  trialRequiresCard: false,
} as const;

const amount = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** "$14.999" */
export const planPriceLabel = `$${amount.format(PLAN.priceMonthly)}`;
/** "$14.999 ARS por mes": así se muestra el precio en todo el producto. */
export const planPriceFullLabel = `${planPriceLabel} ${PLAN.currency} por mes`;
/** "30 días gratis" */
export const trialLabel = `${PLAN.trialDays} días gratis`;
/** "30 días gratis, sin tarjeta" */
export const trialLongLabel = `${trialLabel}${PLAN.trialRequiresCard ? "" : ", sin tarjeta"}`;
