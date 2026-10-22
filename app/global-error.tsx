"use client";

// Error en el layout raíz: no hay estilos ni componentes de la app, así que es HTML mínimo y autosuficiente.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-AR">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
        <main style={{ maxWidth: 360 }}>
          <h1 style={{ fontSize: 24 }}>Algo salió mal</h1>
          <p style={{ color: "#6e6e73", lineHeight: 1.5 }}>No pudimos mostrar la página. Probá de nuevo o volvé al inicio.</p>
          <p>
            <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 20px", fontSize: 16, borderRadius: 12, border: 0, background: "#1d1d1f", color: "#fff" }}>
              Reintentar
            </button>
          </p>
          <p>
            {/* Fuera del árbol de la app no hay router: un enlace común es lo correcto aquí. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: "#1d1d1f", minHeight: 44, display: "inline-block", lineHeight: "44px" }}>
              Ir al inicio
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
