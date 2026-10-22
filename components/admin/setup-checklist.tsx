import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { buildChecklist, requiredPending, type ChecklistInput } from "@/lib/admin/setup-checklist";
import { cn } from "@/lib/format";

/** Progreso de puesta en marcha (solo comercios reales). Desaparece cuando lo esencial está completo. */
export function SetupChecklist({ input }: { input: ChecklistInput }) {
  const items = buildChecklist(input);
  const pending = requiredPending(items);
  if (pending.length === 0 && items.every((i) => i.done || i.optional)) return null;
  const done = items.filter((i) => !i.optional && i.done).length;
  const total = items.filter((i) => !i.optional).length;
  return (
    <section aria-labelledby="setup-title" className="mb-8 rounded-xl border border-line p-4">
      <div className="flex items-baseline gap-3">
        <h2 id="setup-title" className="type-section">Puesta en marcha</h2>
        <p className="type-help" role="status">{done} de {total} pasos esenciales</p>
      </div>
      <ol className="mt-3 divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-3 py-3">
            {i.done ? <Check className="mt-0.5 size-5 shrink-0 text-success" aria-label="Hecho" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted" aria-label="Pendiente" />}
            <div className="min-w-0 flex-1">
              <p className={cn("text-[15px] font-medium", i.done && "text-muted")}>{i.title}{i.optional && <span className="ml-2 text-[13px] font-normal text-muted">Opcional</span>}</p>
              <p className="type-help">{i.why}</p>
            </div>
            {!i.done && (
              <Link href={i.href} className="pressable inline-flex min-h-11 shrink-0 items-center rounded-lg border border-line-strong px-3 text-[14px] hover:bg-subtle">
                {i.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
