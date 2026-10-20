"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Undo2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { ReservationStatus, TenantAccess, TenantRecord, TenantStats } from "@/lib/domain/types";
import { mutateTenantAction } from "@/app/admin/[slug]/actions";
import { demoReducer, type DemoAction, type DemoState } from "@/lib/demo/state";
import { clearDemo, loadDemo, saveDemo } from "@/lib/demo/storage";

type Toast = { id: number; message: string; tone: "ok" | "neutral" | "error"; undo?: () => void };

/** "local": hay cambios guardados en este navegador; "fixture": datos de ejemplo originales. */
export type StorageStatus = "fixture" | "local" | "unavailable";

/** Comercio real: los cambios se guardan en Supabase con la sesión del dueño. */
export type LiveInfo = { tenantId: string; isPublished: boolean; access: TenantAccess; email: string };

type Ctx = {
  mode: "demo" | "live";
  live: LiveInfo | null;
  /** Hay un guardado en curso (modo real). */
  saving: boolean;
  state: DemoState;
  stats: TenantStats | null;
  hydrated: boolean;
  storage: StorageStatus;
  dispatch: (action: DemoAction) => void;
  setReservationStatus: (id: string, status: ReservationStatus) => void;
  notify: (message: string, tone?: Toast["tone"]) => void;
  resetDemo: () => void;
};

const DemoContext = createContext<Ctx | null>(null);

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo debe usarse dentro de <AdminDemoProvider>");
  return ctx;
}

const toInitialState = (record: TenantRecord): DemoState => ({
  slug: record.slug,
  profile: record.profile,
  categories: record.categories,
  reservations: record.reservations,
});

/**
 * Estado del panel de demo de UN comercio. Montar con `key={slug}` para que
 * cambiar de tenant reinicie todo. Perfil y carta se guardan en localStorage
 * (aislado y versionado por tenant); las reservas solo viven en memoria.
 */
export function AdminDemoProvider({
  record,
  live = null,
  children,
}: {
  record: TenantRecord;
  live?: LiveInfo | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const initial = useMemo(() => toInitialState(record), [record]);
  const [state, rawDispatch] = useReducer(demoReducer, initial);

  // Modo real: cuando el server devuelve datos nuevos (router.refresh), se reemplaza el estado
  // optimista por la verdad de la base (IDs reales, posiciones, etc.).
  const firstRecord = useRef(initial);
  useEffect(() => {
    if (!live || firstRecord.current === initial) return;
    rawDispatch({ type: "reset", initial });
  }, [live, initial]);
  const [hydrated, setHydrated] = useState(false);
  const [storage, setStorage] = useState<StorageStatus>("fixture");
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirty = useRef(false);

  // 1) Hidratar desde localStorage una vez, después del primer render (evita mismatch SSR).
  useEffect(() => {
    if (live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- modo real: no hay nada que hidratar
      setHydrated(true);
      return;
    }
    const stored = loadDemo(record.slug);
    if (stored) {
      rawDispatch({ type: "hydrate", profile: stored.profile, categories: stored.categories });
      setStorage("local");
    }
    setHydrated(true);
  }, [record.slug, live]);

  // 2) Persistir perfil y carta tras cada cambio del usuario (nunca reservas).
  useEffect(() => {
    if (live || !hydrated || !dirty.current) return;
    dirty.current = false;
    const ok = saveDemo(state.slug, { profile: state.profile, categories: state.categories });
    setStorage(ok ? "local" : "unavailable");
  }, [live, hydrated, state.slug, state.profile, state.categories]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((t: Omit<Toast, "id">) => {
    clearTimeout(toastTimer.current);
    const id = Date.now();
    setToast({ ...t, id });
    toastTimer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), 4500);
  }, []);

  // Modo real: aplica optimista, guarda con la Server Action y re-sincroniza desde el server.
  const persistLive = useCallback(
    (action: DemoAction) => {
      if (!live) return;
      startSaving(async () => {
        const res = await mutateTenantAction(live.tenantId, action).catch(() => ({
          ok: false as const,
          message: "Sin conexión. No se guardó el cambio.",
        }));
        if (!res.ok) showToast({ tone: "error", message: res.message });
        router.refresh();
      });
    },
    [live, router, showToast],
  );

  const dispatch = useCallback(
    (action: DemoAction) => {
      if (action.type !== "setReservationStatus") dirty.current = true;
      rawDispatch(action);
      persistLive(action);
    },
    [persistLive],
  );

  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const setReservationStatus = useCallback(
    (id: string, status: ReservationStatus) => {
      const target = latest.current.reservations.find((r) => r.id === id);
      if (!target) return;
      const previous = target.status;
      const name = target.name.split(" ")[0];
      rawDispatch({ type: "setReservationStatus", id, status });
      if (live) {
        // En la base, confirmed → pending no es una transición válida: sin "Deshacer".
        persistLive({ type: "setReservationStatus", id, status });
        showToast({
          tone: status === "confirmed" ? "ok" : "neutral",
          message: status === "confirmed" ? `Reserva de ${name} confirmada` : `Solicitud de ${name} rechazada`,
        });
        return;
      }
      showToast({
        tone: status === "confirmed" ? "ok" : "neutral",
        message: status === "confirmed" ? `Reserva de ${name} confirmada (demo)` : `Solicitud de ${name} rechazada (demo)`,
        undo: () => {
          rawDispatch({ type: "setReservationStatus", id, status: previous });
          setToast(null);
        },
      });
    },
    [showToast, live, persistLive],
  );

  const resetDemo = useCallback(() => {
    clearDemo(record.slug);
    rawDispatch({ type: "reset", initial });
    setStorage("fixture");
    showToast({ tone: "neutral", message: "Demo restablecida a los datos de ejemplo" });
  }, [record.slug, initial, showToast]);

  const notify = useCallback((message: string, tone: Toast["tone"] = "ok") => showToast({ message, tone }), [showToast]);

  const value = useMemo(
    () => ({
      mode: (live ? "live" : "demo") as Ctx["mode"],
      live,
      saving,
      state,
      stats: record.stats,
      hydrated,
      storage,
      dispatch,
      setReservationStatus,
      notify,
      resetDemo,
    }),
    [live, saving, state, record.stats, hydrated, storage, dispatch, setReservationStatus, notify, resetDemo],
  );

  return (
    <DemoContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex justify-center px-4 lg:bottom-8">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ y: 40, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl bg-ink py-2.5 pr-2.5 pl-3 text-white shadow-lift"
              role="status"
            >
              <span
                className={
                  toast.tone === "ok"
                    ? "grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-400 text-ink"
                    : toast.tone === "error"
                      ? "grid size-7 shrink-0 place-items-center rounded-lg bg-rose-400 text-ink"
                      : "grid size-7 shrink-0 place-items-center rounded-lg bg-white/15"
                }
              >
                {toast.tone === "ok" ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <X className="size-4" strokeWidth={3} aria-hidden />}
              </span>
              <span className="text-[14px] font-medium">{toast.message}</span>
              {toast.undo && (
                <button
                  type="button"
                  onClick={toast.undo}
                  className="pressable ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-[13px] font-semibold hover:bg-white/20"
                >
                  <Undo2 className="size-3.5" aria-hidden /> Deshacer
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DemoContext.Provider>
  );
}
