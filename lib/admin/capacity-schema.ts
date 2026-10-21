import { z } from "zod";

const optInt = (min: number, max: number) => z.number().int().min(min).max(max);
export const settingsSchema = z.object({
  acceptsReservations: z.boolean(),
  capacityGuests: optInt(1, 2000).nullable(),
  maxPartySize: optInt(1, 50),
  slotIntervalMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  occupancyMinutes: optInt(15, 480),
  minNoticeMinutes: optInt(0, 10080),
  kitchenCutoffMinutes: optInt(0, 480),
  pendingHoldMinutes: optInt(15, 10080),
  holdPending: z.boolean(),
});

export type CapacitySettings = z.infer<typeof settingsSchema>;
