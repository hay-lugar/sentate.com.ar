"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Cabecera fija (no scrollea). Se arrastra junto con el handle. */
  header?: ReactNode;
  className?: string;
  label: string;
};

/**
 * Bottom sheet estilo iOS: arrastrable desde el handle, cierra con swipe,
 * backdrop o Escape. No usa portal para heredar las CSS vars del tenant.
 */
export function BottomSheet({ open, onClose, children, header, className, label }: BottomSheetProps) {
  const controls = useDragControls();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
          <motion.div
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            className={cn(
              "absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col",
              "rounded-t-[2rem] bg-surface shadow-float",
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
              <div className="mx-auto mt-3 h-1.5 w-11 rounded-full bg-line" />
              <div className="flex items-start gap-3 px-6 pt-4 pb-2">
                <div className="min-w-0 flex-1">{header}</div>
                <button
                  type="button"
                  onClick={onClose}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Cerrar"
                  className="pressable -mr-1 grid size-9 shrink-0 place-items-center rounded-full bg-background text-muted hover:text-foreground"
                >
                  <X className="size-[18px]" strokeWidth={2.5} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
