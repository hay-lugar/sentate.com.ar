import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end lg:mb-8">
      <div>
        {eyebrow && <p className="text-[13px] font-semibold text-muted first-letter:uppercase">{eyebrow}</p>}
        <h1 className="mt-1 text-3xl leading-tight font-bold sm:text-4xl">{title}</h1>
      </div>
      {children && <div className="sm:ml-auto">{children}</div>}
    </div>
  );
}
