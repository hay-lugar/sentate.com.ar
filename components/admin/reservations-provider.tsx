"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Undo2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Reservation, ReservationStatus } from "@/data/mock";

type Toast = { id: number; message: string; tone: "ok" | "no"; undo: () => void };

type Ctx = {
  reservations: Reservation[];
  setStatus: (id: string, status: ReservationStatus) => void;
};

const ReservationsContext = createContext<Ctx | null>(null);

export function useReservations() {
  const ctx = useContext(ReservationsContext);
  if (!ctx) throw new Error("useReservations debe usarse dentro de <ReservationsProvider>");
  return ctx;
}

/** Estado de reservas del panel (mock en memoria) + toasts con deshacer. */
export function ReservationsProvider({ initial, children }: { initial: Reservation[]; children: ReactNode }) {
  const [reservations, setReservations] = useState(initial);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const latest = useRef(reservations);
  latest.current = reservations;

  const setStatus = useCallback((id: string, status: ReservationStatus) => {
    const target = latest.current.find((r) => r.id === id);
    if (!target) return;
    const previous = target.status;
    const name = target.name.split(" ")[0];
    setReservations((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
    clearTimeout(timer.current);
    const toastId = Date.now();
    setToast({
      id: toastId,
      tone: status === "confirmed" ? "ok" : "no",
      message: status === "confirmed" ? `Reserva de ${name} confirmada` : `Reserva de ${name} rechazada`,
      undo: () => {
        setReservations((list) => list.map((r) => (r.id === id ? { ...r, status: previous } : r)));
        setToast(null);
      },
    });
    timer.current = setTimeout(() => setToast((t) => (t?.id === toastId ? null : t)), 4500);
  }, []);

  return (
    <ReservationsContext.Provider value={{ reservations, setStatus }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-8">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ y: 40, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink py-2.5 pr-2.5 pl-3 text-white shadow-lift"
              role="status"
            >
              <span
                className={
                  toast.tone === "ok"
                    ? "grid size-7 place-items-center rounded-lg bg-emerald-400 text-ink"
                    : "grid size-7 place-items-center rounded-lg bg-white/15"
                }
              >
                {toast.tone === "ok" ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
              </span>
              <span className="text-[14px] font-medium">{toast.message}</span>
              <button
                type="button"
                onClick={toast.undo}
                className="pressable ml-2 inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-[13px] font-semibold hover:bg-white/20"
              >
                <Undo2 className="size-3.5" /> Deshacer
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ReservationsContext.Provider>
  );
}
