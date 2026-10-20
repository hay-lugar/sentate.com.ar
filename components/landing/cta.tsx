"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, FlaskConical, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { planPriceLabel, trialLongLabel } from "@/lib/config/plan";
import { simulateRequest } from "@/lib/demo/simulate";

type Phase = "idle" | "sending" | "done" | "failed";

/**
 * CTA final. Todavía no hay registro real: el formulario simula el envío,
 * no guarda el email y lo dice explícitamente.
 */
export function FinalCta() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Ingresá un email válido.");
      return;
    }
    setError(null);
    const controller = new AbortController();
    inFlight.current = controller;
    setPhase("sending");
    try {
      await simulateRequest(controller.signal);
      setEmail(""); // no conservamos el email
      setPhase("done");
    } catch {
      if (!controller.signal.aborted) setPhase("failed");
    } finally {
      inFlight.current = null;
    }
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
            <p className="mt-5 max-w-md text-lg text-white/80">
              {trialLongLabel[0].toUpperCase() + trialLongLabel.slice(1)}. Después, {planPriceLabel} por mes y sin comisión por reserva.
            </p>
          </div>

          <div>
            <AnimatePresence mode="wait">
              {phase === "done" ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  role="status"
                  className="flex items-start gap-4 rounded-3xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-300 text-ink">
                    <FlaskConical className="size-6" aria-hidden />
                  </span>
                  <div>
                    <p className="font-display text-lg font-bold">Envío simulado</p>
                    <p className="text-[14px] text-white/80">
                      El registro todavía no está habilitado: no guardamos tu email ni te enviamos nada. Mientras tanto, probá la demo.
                    </p>
                    <button type="button" onClick={() => setPhase("idle")} className="mt-3 text-[14px] font-semibold text-white underline underline-offset-4">
                      Volver
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  exit={{ opacity: 0, scale: 0.97 }}
                  onSubmit={submit}
                  noValidate
                  aria-busy={phase === "sending"}
                  className="flex flex-col gap-2 rounded-[1.6rem] bg-white/10 p-2 ring-1 ring-white/15 backdrop-blur sm:flex-row"
                >
                  <label htmlFor="cta-email" className="sr-only">
                    Email
                  </label>
                  <input
                    id="cta-email"
                    type="email"
                    autoComplete="off"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                      if (phase === "failed") setPhase("idle");
                    }}
                    aria-invalid={!!error}
                    aria-describedby="cta-help"
                    placeholder="tu@restaurante.com"
                    className="h-14 min-w-0 flex-1 rounded-2xl bg-transparent px-4 text-[16px] text-white outline-none placeholder:text-white/55 focus-visible:ring-2 focus-visible:ring-white/60"
                  />
                  <button
                    type="submit"
                    disabled={phase === "sending"}
                    className="pressable inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand px-6 font-semibold text-brand-fg shadow-brand disabled:opacity-70"
                  >
                    {phase === "sending" ? (
                      <>
                        <LoaderCircle className="size-5 animate-spin" aria-hidden /> Enviando…
                      </>
                    ) : (
                      <>
                        Quiero probarlo <ArrowRight className="size-[18px]" aria-hidden />
                      </>
                    )}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
            <div id="cta-help" className="mt-3 min-h-5 text-[13px]" aria-live="polite">
              {error ? (
                <span className="flex items-center gap-1.5 text-rose-300">
                  <AlertTriangle className="size-3.5" aria-hidden /> {error}
                </span>
              ) : phase === "failed" ? (
                <span className="flex items-center gap-1.5 text-rose-300">
                  <AlertTriangle className="size-3.5" aria-hidden /> Error simulado. Probá de nuevo.
                </span>
              ) : (
                <span className="text-white/70">Demo: este formulario no guarda ni envía tu email.</span>
              )}
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-white/75">
              {["Sin tarjeta para la prueba", "Precio fijo mensual", "Cancelás cuando quieras"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-emerald-400" strokeWidth={3} aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
