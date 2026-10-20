// Simulación de red para la demo. Mecanismo de desarrollo documentado en el README:
//
//   ?simular=error   → la próxima operación falla
//   ?simular=lento   → demora 4 s
//   NEXT_PUBLIC_DEMO_SIMULATE=error|lento  → mismo efecto para toda la app
//
// El query param tiene prioridad sobre la variable de entorno.

export type SimulationMode = "ok" | "error" | "lento";

const parse = (v: string | null | undefined): SimulationMode | null =>
  v === "error" || v === "lento" || v === "ok" ? v : null;

export function getSimulationMode(search: string = typeof window === "undefined" ? "" : window.location.search): SimulationMode {
  const fromQuery = parse(new URLSearchParams(search).get("simular"));
  return fromQuery ?? parse(process.env.NEXT_PUBLIC_DEMO_SIMULATE) ?? "ok";
}

export class SimulatedError extends Error {
  constructor() {
    super("Error simulado de la demo");
    this.name = "SimulatedError";
  }
}

/** Promesa cancelable con AbortSignal: limpia su temporizador si se aborta. */
export function simulateRequest(signal: AbortSignal, mode: SimulationMode = getSimulationMode()): Promise<void> {
  const delay = mode === "lento" ? 4000 : 1100;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => (mode === "error" ? reject(new SimulatedError()) : resolve()), delay);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
