"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Reservation, ReservationStatus, TenantAccess, TenantProfile, TenantRecord, TenantStats } from "@/lib/domain/types";
import { mutateTenantAction } from "@/app/admin/[slug]/actions";
import { playNewRequestSound, soundEnabled } from "@/lib/admin/notify-sound";
import type { LiveMutation, MutationResult } from "@/lib/admin/live-mutations";
import { demoReducer, type DemoAction, type DemoState } from "@/lib/demo/state";
import { clearDemo, loadDemo, saveDemo } from "@/lib/demo/storage";
import { isPendingSync, resolveIds, toLiveMutation, toSettingsMutation } from "@/lib/admin/to-live-mutation";
import { useReservationsRealtime, type RealtimeStatus } from "./use-reservations-realtime";

type ToastAction = { label: string; run: () => void };
type Toast = { id: number; message: string; tone: "ok" | "neutral" | "error"; action?: ToastAction };
type Tone = Toast["tone"];

type LiveBuild = (s: DemoState) => { mutation: LiveMutation | null; optimistic?: DemoAction };
type LiveOpts = { success?: string; tone?: Tone; onSuccess?: (res: MutationResult & { ok: true }) => void };
type RunLive = (build: LiveBuild, opts?: LiveOpts) => Promise<MutationResult>;

/** "local": hay cambios guardados en este navegador; "fixture": datos de ejemplo originales. */
export type StorageStatus = "fixture" | "local" | "unavailable";

/** Comercio real: los cambios se guardan en Supabase con la sesión del dueño. */
export type LiveInfo = { tenantId: string; isPublished: boolean; access: TenantAccess; email: string; settingsVersion: string; coverUrl: string | null; reservationsEnabled: boolean };

type Ctx = {
  mode: "demo" | "live";
  live: LiveInfo | null;
  /** Hay escrituras en curso (modo real). */
  saving: boolean;
  /** Estado de la conexión en vivo de reservas (modo real). */
  realtime: RealtimeStatus | null;
  state: DemoState;
  stats: TenantStats | null;
  hydrated: boolean;
  storage: StorageStatus;
  /**
   * Aplica una acción del panel. En demo se aplica y se anuncia al instante. En modo real se aplica
   * de forma optimista, se guarda en la base y `success` se anuncia SOLO si la base confirmó;
   * si falla, se revierte y se explica por qué.
   */
  dispatch: (action: DemoAction, success?: string, tone?: Tone) => void;
  setReservationStatus: (id: string, status: ReservationStatus) => void;
  /** Ajustes: perfil y (opcionalmente) horarios en una sola transacción. Resuelve con el resultado. */
  saveSettings: (profile: TenantProfile, includeSchedule: boolean) => Promise<MutationResult>;
  notify: (message: string, tone?: Tone) => void;
  resetDemo: () => void;
  /** ID real de algo creado en esta sesión (un formulario abierto con el ID temporal sigue funcionando). */
  resolveId: (id: string) => string;
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

const NETWORK_FAILURE: MutationResult = { ok: false, code: "network", message: "Sin conexión. No se guardó el cambio." };

const STATUS_MESSAGES: Record<ReservationStatus, (name: string) => string> = {
  confirmed: (n) => `Reserva de ${n} confirmada`,
  rejected: (n) => `Solicitud de ${n} rechazada`,
  cancelled: (n) => `Reserva de ${n} cancelada`,
  pending: (n) => `Solicitud de ${n} pendiente`,
  expired: (n) => `Solicitud de ${n} vencida`,
  finished: (n) => `Reserva de ${n} finalizada`,
  no_show: (n) => `${n} no se presentó`,
};

/**
 * Estado del panel de UN comercio. Montar con `key` por tenant para que cambiar de comercio
 * reinicie todo (incluido el canal de Realtime).
 * Demo: perfil y carta en localStorage (aislado por tenant); reservas solo en memoria.
 * Real: escrituras serializadas contra Supabase con control de versión y reversión ante error.
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
  const initial = useMemo(() => toInitialState(record), [record]);
  const [state, rawDispatch] = useReducer(demoReducer, initial);
  const [hydrated, setHydrated] = useState(false);
  const [storage, setStorage] = useState<StorageStatus>("fixture");
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirty = useRef(false);

  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  /** Aplica una acción y deja `latest` al día en el acto (las escrituras encoladas leen de ahí). */
  const apply = useCallback((a: DemoAction) => {
    latest.current = demoReducer(latest.current, a);
    rawDispatch(a);
  }, []);
  /** IDs temporales del cliente → IDs reales confirmados por la base (ref para la cola, state para la UI). */
  const confirmedIds = useRef(new Map<string, string>());
  const [idAliases, setIdAliases] = useState<ReadonlyMap<string, string>>(() => new Map());
  const resolveId = useCallback((id: string) => idAliases.get(id) ?? id, [idAliases]);

  /* ─────────── Modo real: cola de escrituras ─────────── */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);
  const [saving, setSaving] = useState(false);
  const deferredInitial = useRef<DemoState | null>(null);
  const settingsVersion = useRef(live?.settingsVersion ?? "");
  useEffect(() => {
    if (live) settingsVersion.current = live.settingsVersion;
  }, [live]);

  // Cuando el server devuelve datos nuevos (router.refresh), se reemplaza el estado optimista por la
  // verdad de la base. Si hay escrituras en curso, se espera a que terminen para no "des-hacer" la UI.
  const firstRecord = useRef(initial);
  useEffect(() => {
    if (!live || firstRecord.current === initial) return;
    if (inFlight.current > 0) deferredInitial.current = initial;
    else apply({ type: "reset", initial });
  }, [live, initial, apply]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((t: Omit<Toast, "id">) => {
    clearTimeout(toastTimer.current);
    const id = Date.now();
    setToast({ ...t, id });
    toastTimer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), t.action ? 8000 : 4500);
  }, []);

  /**
   * Encola una escritura real. `build` recibe el estado vigente al momento de ejecutarse (no al
   * hacer clic) para calcular versiones y la actualización optimista. Nunca anuncia éxito antes de
   * que la base confirme; ante error revierte al estado previo y ofrece la acción adecuada.
   */
  const runLiveRef = useRef<RunLive | null>(null);
  const runLive: RunLive = useCallback(
    (build, opts = {}) => {
      if (!live) return Promise.resolve({ ok: true });
      inFlight.current++;
      setSaving(true);
      const run = queue.current.then(async (): Promise<MutationResult> => {
        const before = latest.current;
        const { mutation, optimistic } = build(before);
        if (!mutation) return { ok: true };
        if (optimistic) apply(optimistic);
        const tempId = createdTempId(before, latest.current, optimistic);
        const res = await mutateTenantAction(live.tenantId, mutation).catch(() => NETWORK_FAILURE);
        if (res.ok) {
          // Alta confirmada: el ID temporal pasa a ser el real ya mismo (sin esperar el refresh),
          // así una acción encolada sobre lo recién creado (p. ej. un plato en esa categoría) funciona.
          if (tempId && res.id) {
            confirmedIds.current.set(tempId, res.id);
            setIdAliases(new Map(confirmedIds.current));
            apply({ type: "confirmCreated", entity: optimistic?.type === "addCategory" ? "category" : "dish", tempId, id: res.id, version: res.version });
          }
          opts.onSuccess?.(res);
          if (opts.success) showToast({ tone: opts.tone ?? "ok", message: opts.success });
        } else {
          if (optimistic) apply({ type: "reset", initial: before });
          const action: ToastAction | undefined =
            res.code === "session"
              ? { label: "Ingresar", run: () => router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`) }
              : res.code === "network" || res.code === "error"
                ? { label: "Reintentar", run: () => void runLiveRef.current?.(build, opts) }
                : undefined;
          showToast({ tone: "error", message: res.message, action });
        }
        // Re-sincroniza con la base (IDs y versiones reales, o la verdad tras un conflicto).
        if (res.ok || res.code === "stale" || res.code === "conflict") router.refresh();
        return res;
      });
      queue.current = run
        .catch(() => undefined)
        .finally(() => {
          inFlight.current--;
          if (inFlight.current === 0) {
            setSaving(false);
            if (deferredInitial.current) {
              apply({ type: "reset", initial: deferredInitial.current });
              deferredInitial.current = null;
            }
          }
        });
      return run;
    },
    [live, router, showToast, apply],
  );

  useEffect(() => {
    runLiveRef.current = runLive;
  }, [runLive]);

  /* ─────────── Modo real: reservas en vivo ─────────── */
  const onUpsert = useCallback(
    (reservation: Reservation, isNew: boolean) => {
      const known = latest.current.reservations.some((r) => r.id === reservation.id);
      apply({ type: "upsertReservation", reservation });
      if (isNew && !known && reservation.status === "pending") {
        if (soundEnabled()) playNewRequestSound();
        showToast({ tone: "neutral", message: `Nueva solicitud de ${reservation.name.split(" ")[0]} · ${reservation.guests} pers. · ${reservation.time}` });
      }
    },
    [showToast, apply],
  );
  const onResync = useCallback(
    (reservations: Reservation[]): boolean => {
      // Con escrituras pendientes no se pisa la UI optimista: se descarta y el hook vuelve a leer.
      if (inFlight.current > 0) return false;
      apply({ type: "syncReservations", reservations });
      return true;
    },
    [apply],
  );
  const realtime = useLiveRealtime(live, state.profile.timezone, onUpsert, onResync);

  /* ─────────── Demo: localStorage ─────────── */
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

  useEffect(() => {
    if (live || !hydrated || !dirty.current) return;
    dirty.current = false;
    const ok = saveDemo(state.slug, { profile: state.profile, categories: state.categories });
    setStorage(ok ? "local" : "unavailable");
  }, [live, hydrated, state.slug, state.profile, state.categories]);

  /* ─────────── API del contexto ─────────── */
  const dispatch = useCallback(
    (action: DemoAction, success?: string, tone: Tone = "ok") => {
      if (!live) {
        if (action.type !== "setReservationStatus") dirty.current = true;
        rawDispatch(action);
        if (success) showToast({ tone, message: success });
        return;
      }
      // Se resuelve al EJECUTARSE (no al hacer clic): si la acción toca algo recién creado, para
      // entonces la base ya devolvió su ID real.
      void runLive(
        (s) => {
          const resolved = resolveIds(action, confirmedIds.current);
          const mutation = toLiveMutation(s, resolved);
          if (!mutation && isPendingSync(s, resolved)) {
            showToast({ tone: "neutral", message: "Todavía se está guardando lo último que agregaste. Probá de nuevo en un segundo." });
          }
          return { mutation, optimistic: resolved };
        },
        { success, tone },
      );
    },
    [live, runLive, showToast],
  );

  const setReservationStatus = useCallback(
    (id: string, status: ReservationStatus) => {
      const target = latest.current.reservations.find((r) => r.id === id);
      if (!target) return;
      const name = target.name.split(" ")[0];
      const message = STATUS_MESSAGES[status](name);
      if (live) {
        void runLive(
          (s) => ({ mutation: toLiveMutation(s, { type: "setReservationStatus", id, status }), optimistic: { type: "setReservationStatus", id, status } }),
          { success: message, tone: status === "confirmed" ? "ok" : "neutral" },
        );
        return;
      }
      const previous = target.status;
      rawDispatch({ type: "setReservationStatus", id, status });
      showToast({
        tone: status === "confirmed" ? "ok" : "neutral",
        message: `${message} (demo)`,
        action: {
          label: "Deshacer",
          run: () => {
            rawDispatch({ type: "setReservationStatus", id, status: previous });
            setToast(null);
          },
        },
      });
    },
    [showToast, live, runLive],
  );

  const saveSettings = useCallback(
    (profile: TenantProfile, includeSchedule: boolean): Promise<MutationResult> => {
      if (!live) {
        dirty.current = true;
        rawDispatch({ type: "updateProfile", profile });
        showToast({ tone: "ok", message: "Ajustes guardados en este navegador" });
        return Promise.resolve({ ok: true });
      }
      // Sin actualización optimista: el formulario conserva lo escrito hasta que la base confirme.
      return runLive(() => ({ mutation: toSettingsMutation(profile, includeSchedule, settingsVersion.current) }), {
        success: "Ajustes guardados",
        onSuccess: (res) => {
          if (res.version) settingsVersion.current = res.version;
          apply({ type: "updateProfile", profile });
        },
      });
    },
    [live, runLive, showToast, apply],
  );

  const resetDemo = useCallback(() => {
    clearDemo(record.slug);
    rawDispatch({ type: "reset", initial });
    setStorage("fixture");
    showToast({ tone: "neutral", message: "Demo restablecida a los datos de ejemplo" });
  }, [record.slug, initial, showToast]);

  const notify = useCallback((message: string, tone: Tone = "ok") => showToast({ message, tone }), [showToast]);

  const value = useMemo(
    () => ({
      mode: (live ? "live" : "demo") as Ctx["mode"],
      live,
      saving,
      realtime,
      state,
      stats: record.stats,
      hydrated,
      storage,
      dispatch,
      setReservationStatus,
      saveSettings,
      notify,
      resetDemo,
      resolveId,
    }),
    [live, saving, realtime, state, record.stats, hydrated, storage, dispatch, setReservationStatus, saveSettings, notify, resetDemo, resolveId],
  );

  return (
    <DemoContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex justify-center px-4 lg:bottom-20">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl bg-foreground py-3 pr-3 pl-4 text-background shadow-lift"
              role={toast.tone === "error" ? "alert" : "status"}
            >
              {toast.tone === "ok" ? (
                <Check className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />
              ) : toast.tone === "error" ? (
                <X className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />
              ) : (
                <Info className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
              )}
              <span className="text-[0.9375rem]">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={toast.action.run}
                  className="pressable ml-1 inline-flex min-h-9 shrink-0 items-center rounded-lg border border-background/40 px-3 type-label hover:bg-background/10"
                >
                  {toast.action.label}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DemoContext.Provider>
  );
}

/** ID temporal que la actualización optimista le dio a una categoría o plato nuevos. */
function createdTempId(before: DemoState, after: DemoState, action?: DemoAction): string | undefined {
  if (action?.type === "addCategory") return after.categories.find((c) => !before.categories.some((b) => b.id === c.id))?.id;
  if (action?.type === "saveDish" && !action.dish.id) {
    const old = new Set(before.categories.flatMap((c) => c.dishes.map((d) => d.id)));
    return after.categories.flatMap((c) => c.dishes).find((d) => !old.has(d.id))?.id;
  }
  return undefined;
}

/** Realtime solo en modo real (los hooks no pueden ser condicionales: se envuelve). */
function useLiveRealtime(
  live: LiveInfo | null,
  timeZone: string,
  onUpsert: (r: Reservation, isNew: boolean) => void,
  onResync: (rs: Reservation[]) => boolean,
): RealtimeStatus | null {
  const status = useReservationsRealtime({ tenantId: live?.tenantId ?? "", timeZone, onUpsert, onResync, enabled: !!live });
  return live ? status : null;
}
