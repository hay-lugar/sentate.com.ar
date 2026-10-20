"use client";

import { motion } from "framer-motion";
import { ArrowRight, CalendarCheck } from "lucide-react";

/** Bottom bar permanente con el CTA principal del comensal. */
export function ReserveBar({ onReserve }: { onReserve: () => void }) {
  return (
    <motion.div
      initial={{ y: 120 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 26, stiffness: 260, delay: 0.35 }}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md bg-linear-to-t from-background via-background/90 to-transparent px-4 pt-6 pb-safe"
    >
      <motion.button
        type="button"
        onClick={onReserve}
        whileTap={{ scale: 0.97 }}
        whileHover={{ y: -2 }}
        aria-haspopup="dialog"
        className="group flex h-16 w-full items-center gap-3 rounded-[1.4rem] bg-brand pr-3 pl-5 text-left text-brand-fg shadow-brand"
      >
        <CalendarCheck className="size-6 shrink-0" strokeWidth={2.25} aria-hidden />
        <span className="flex-1 leading-tight">
          <span className="block font-display text-[17px] font-bold">Reservar mesa</span>
          <span className="block text-[12px] font-medium opacity-90">Solicitá tu mesa · el local la revisa</span>
        </span>
        <span aria-hidden className="grid size-10 place-items-center rounded-2xl bg-white/20 transition-transform duration-300 group-hover:translate-x-0.5">
          <ArrowRight className="size-5" strokeWidth={2.5} />
        </span>
      </motion.button>
    </motion.div>
  );
}
