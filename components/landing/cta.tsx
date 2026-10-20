"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useState } from "react";

export function FinalCta() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const valid = /^\S+@\S+\.\S+$/.test(email);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setState("loading");
    setTimeout(() => setState("done"), 1100);
  };

  return (
    <section id="empezar" className="scroll-mt-24 px-3 pb-6 sm:px-5">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-ink px-6 py-16 text-white sm:px-14 sm:py-24">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -bottom-40 -left-20 h-[28rem] w-[28rem] rounded-full bg-brand/45 blur-[120px]" />
          <div className="absolute -top-32 right-0 h-80 w-80 rounded-full bg-amber-400/20 blur-[100px]" />
          <div className="grain absolute inset-0 opacity-60" />
        </div>

        <div className="relative grid items-end gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-[2.6rem] leading-[0.95] font-bold sm:text-6xl">
              Tu local lleno.
              <br />
              <span className="text-brand">Tu fila, vacía.</span>
            </h2>
            <p className="mt-5 max-w-md text-lg text-white/65">
              Creá tu cuenta y publicá tu menú hoy. 14 días gratis, sin tarjeta y sin comisión por reserva.
            </p>
          </div>

          <div>
            <AnimatePresence mode="wait">
              {state === "done" ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-4 rounded-3xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-400 text-ink">
                    <Check className="size-6" strokeWidth={3} />
                  </span>
                  <div>
                    <p className="font-display text-lg font-bold">¡Bienvenido a Sentate!</p>
                    <p className="text-[14px] text-white/65">Te mandamos el link de acceso a {email}.</p>
                  </div>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  exit={{ opacity: 0, scale: 0.97 }}
                  onSubmit={submit}
                  className="flex flex-col gap-2 rounded-[1.6rem] bg-white/10 p-2 ring-1 ring-white/15 backdrop-blur sm:flex-row"
                >
                  <label htmlFor="cta-email" className="sr-only">Email</label>
                  <input
                    id="cta-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@restaurante.com"
                    className="h-14 min-w-0 flex-1 rounded-2xl bg-transparent px-4 text-[16px] text-white outline-none placeholder:text-white/40"
                  />
                  <button
                    type="submit"
                    disabled={state === "loading"}
                    className="pressable inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand px-6 font-semibold text-brand-fg shadow-brand"
                  >
                    {state === "loading" ? <LoaderCircle className="size-5 animate-spin" /> : <>Empezar gratis <ArrowRight className="size-[18px]" /></>}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-white/55">
              {["Configuración guiada", "Soporte por WhatsApp", "Cancelás cuando quieras"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-emerald-400" strokeWidth={3} /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
