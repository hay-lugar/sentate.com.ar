import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end lg:mb-8">
      <div>
        {eyebrow && <p className="text-[14px] text-muted first-letter:uppercase">{eyebrow}</p>}
        <h1 className="text-3xl leading-tight font-semibold">{title}</h1>
      </div>
      {children && <div className="sm:ml-auto">{children}</div>}
    </div>
  );
}
