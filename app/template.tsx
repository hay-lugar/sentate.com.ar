"use client";

import { useEffect, type ReactNode } from "react";

// Un template se vuelve a montar en cada navegación: ahí se hace el fundido de entrada. En la primera carga NO se anima (el HTML
// ya viene pintado y animarlo demoraría el contenido); se reconoce porque el módulo todavía no vio ninguna navegación.
let seen = false;

export default function Template({ children }: { children: ReactNode }) {
  const animate = seen;
  useEffect(() => {
    seen = true;
  }, []);
  return <div className={animate ? "page-in" : undefined}>{children}</div>;
}
