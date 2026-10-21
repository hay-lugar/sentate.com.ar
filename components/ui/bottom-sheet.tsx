"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/format";
import { useThemeStyle } from "./theme-scope";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Nombre accesible del diálogo. */
  label: string;
  /** Cabecera fija (no scrollea), arrastrable junto con el handle. */
  header?: ReactNode;
  /** Pie fijo (botones de acción). Queda sobre el teclado/safe area. */
  footer?: ReactNode;
  className?: string;
  /** Selector del elemento a enfocar al abrir. Default: primer control enfocable del contenido. */
  initialFocus?: string;
};

const noopSubscribe = () => () => {};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet estilo iOS, accesible:
 * - foco inicial dentro del diálogo, Tab/Shift+Tab contenidos, foco restaurado al cerrar;
 * - Escape y backdrop cierran; el resto de la página queda `inert` (no interactivo);
 * - se monta en un portal pero conserva las CSS vars del tenant vía ThemeScope.
 */
export function BottomSheet({ open, onClose, children, label, header, footer, className, initialFocus }: BottomSheetProps) {
  const controls = useDragControls();
  const themeStyle = useThemeStyle();
  const panelRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  // true solo en el cliente (el portal necesita document.body).
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    // Fondo no interactivo: todo lo que no es el portal queda inert.
    const siblings = Array.from(document.body.children).filter(
      (el) => el !== portalRef.current && !el.hasAttribute("inert"),
    ) as HTMLElement[];
    siblings.forEach((el) => el.setAttribute("inert", ""));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        (initialFocus && panel.querySelector<HTMLElement>(initialFocus)) ||
        panel.querySelector<HTMLElement>(`[data-sheet-body] ${FOCUSABLE}`) ||
        panel.querySelector<HTMLElement>(FOCUSABLE) ||
        panel;
      target.focus({ preventScroll: true });
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      siblings.forEach((el) => el.removeAttribute("inert"));
      document.body.style.overflow = prevOverflow;
      const restore = restoreRef.current;
      if (restore && document.contains(restore)) restore.focus({ preventScroll: true });
    };
  }, [open, initialFocus]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <div ref={portalRef} style={themeStyle}>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50">
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={onClose}
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              className={cn(
                "absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col outline-none",
                "rounded-t-2xl bg-surface shadow-lift",
                className,
              )}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 340 }}
              drag="y"
              dragControls={controls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.05, bottom: 0.7 }}
              onDragEnd={handleDragEnd}
            >
              <div
                className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
                onPointerDown={(e) => controls.start(e)}
              >
                <div aria-hidden className="mx-auto mt-3 h-1 w-10 rounded-full bg-line-strong" />
                <div className="flex items-start gap-3 px-6 pt-4 pb-2">
                  <div className="min-w-0 flex-1">
                    {header}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Cerrar"
                    className="pressable -mr-1 grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-subtle hover:text-foreground"
                  >
                    <X className="size-[18px]" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <div data-sheet-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {children}
              </div>
              {footer && (
                <div className="shrink-0 border-t border-line bg-surface px-6 pt-4 pb-safe">{footer}</div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
