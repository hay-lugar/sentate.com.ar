"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/** Framer Motion respeta `prefers-reduced-motion` del sistema en toda la app. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? "auto" : "smooth");
