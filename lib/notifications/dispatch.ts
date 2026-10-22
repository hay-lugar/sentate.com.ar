import { renderNotification, type NotificationKind, type NotificationPayload } from "./templates";
import type { EmailProvider } from "./provider";

export type Claimed = { id: string; kind: NotificationKind; recipient: string; payload: NotificationPayload; attempts: number };

export type DispatchDeps = {
  claim: (limit: number) => Promise<Claimed[]>;
  complete: (id: string, result: { ok: boolean; providerId?: string; error?: string; retryable?: boolean }) => Promise<void>;
  provider: EmailProvider;
  brandName: string;
};

export type DispatchSummary = { claimed: number; sent: number; retry: number; failed: number };

/** Un ciclo del despachador: reclama avisos, los envía y registra el resultado REAL de cada uno. */
export async function dispatchOnce(deps: DispatchDeps, limit = 20): Promise<DispatchSummary> {
  const rows = await deps.claim(limit);
  const out: DispatchSummary = { claimed: rows.length, sent: 0, retry: 0, failed: 0 };
  for (const row of rows) {
    const msg = renderNotification(row.kind, row.payload, deps.brandName);
    const res = await deps.provider.send({ to: row.recipient, ...msg, idempotencyKey: row.id });
    if (res.ok) {
      await deps.complete(row.id, { ok: true, providerId: res.providerId });
      out.sent++;
    } else {
      await deps.complete(row.id, { ok: false, error: res.error, retryable: res.retryable });
      if (res.retryable) out.retry++;
      else out.failed++;
    }
  }
  return out;
}
