import Link from "next/link";
import { cn } from "@/lib/format";

export function Pager({ base, page, total, size }: { base: string; page: number; total: number; size: number }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  const href = (p: number) => `${base}${base.includes("?") ? "&" : "?"}p=${p}`;
  return (
    <nav aria-label="Páginas" className="mt-4 flex items-center justify-between text-[0.9375rem]">
      {page > 1 ? <Link href={href(page - 1)} className="inline-flex min-h-11 items-center underline underline-offset-4">← Anterior</Link> : <span />}
      <span className="text-muted">Página {page} de {pages}</span>
      {page < pages ? <Link href={href(page + 1)} className="inline-flex min-h-11 items-center underline underline-offset-4">Siguiente →</Link> : <span />}
    </nav>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; active: boolean }[]; current?: string }) {
  return (
    <nav aria-label={current ?? "Filtros"} className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined}
          className={cn("inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-[0.875rem]", t.active ? "border-foreground bg-foreground font-medium text-background" : "border-line-strong hover:bg-subtle")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function SearchForm({ q, placeholder, hidden }: { q: string; placeholder: string; hidden?: Record<string, string> }) {
  return (
    <form role="search" className="mb-4 flex gap-2">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor="q" className="sr-only">{placeholder}</label>
      <input id="q" name="q" defaultValue={q} placeholder={placeholder} className="h-12 min-w-0 flex-1 rounded-xl bg-surface px-4 text-[1rem] ring-1 ring-field outline-none focus:ring-2 focus:ring-foreground" />
      <button type="submit" className="pressable h-12 rounded-xl bg-foreground px-5 text-[0.9375rem] font-medium text-background">Buscar</button>
    </form>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-line/70 px-6 py-10 text-center"><p className="text-[1.0625rem] font-semibold">{children}</p></div>;
}

export function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line/70 px-4 py-3">
      <dt className="type-help">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="mt-0.5 type-help">{note}</dd>}
    </div>
  );
}
