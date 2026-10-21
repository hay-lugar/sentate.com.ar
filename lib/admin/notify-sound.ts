// Aviso sonoro OPCIONAL de solicitudes nuevas. Apagado por defecto: lo activa la persona (y su navegador exige un gesto
// previo para reproducir audio). Sin archivos: un tono corto con Web Audio. Nunca se reproduce al cargar ni al resincronizar,
// solo cuando llega una solicitud nueva en vivo.

const KEY = "sentate:new-request-sound";

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
}

let ctx: AudioContext | null = null;

/** Reproduce el tono. Devuelve false si el navegador no lo permite (se ignora sin molestar). */
export function playNewRequestSound(): boolean {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    for (const [i, freq] of [660, 880].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.12, t + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.16);
      osc.stop(t + i * 0.16 + 0.15);
    }
    return true;
  } catch {
    return false;
  }
}
