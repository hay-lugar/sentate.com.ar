"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import type { TenantTheme } from "@/lib/domain/types";
import { themeStyle } from "@/lib/theme";

const ThemeStyleContext = createContext<CSSProperties | undefined>(undefined);

/** Estilo de tema activo: lo usan los portales (sheets) para conservar las CSS vars del tenant. */
export const useThemeStyle = () => useContext(ThemeStyleContext);

export function ThemeScope({ theme, className, children }: { theme: TenantTheme; className?: string; children: ReactNode }) {
  const style = themeStyle(theme);
  return (
    <ThemeStyleContext.Provider value={style}>
      <div style={style} className={className}>
        {children}
      </div>
    </ThemeStyleContext.Provider>
  );
}
