"use client";

/*
  Last-resort boundary: catches errors thrown by the ROOT layout itself, which
  the (app) boundary cannot see because it renders inside that layout.

  It replaces the whole document, so it must ship its own <html> and <body> —
  and it cannot rely on globals.css having been applied, since a failed root
  layout is exactly the case where it may not have been. Hence inline styles and
  no imported components. The palette is hardcoded to match the app tokens.
*/
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0e12",
          color: "#f2f4f7",
          fontFamily:
            "Poppins, ui-sans-serif, system-ui, -apple-system, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "26rem" }}>
          <div
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "#84e9ff",
              boxShadow: "0 0 10px #84e9ff",
              margin: "0 auto 1.5rem",
            }}
          />
          <h1 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
            Synera Content Studio no pudo iniciar
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              color: "#98a2b3",
            }}
          >
            Falló algo en la raíz de la aplicación. Recargar suele alcanzar.
          </p>

          {error.digest ? (
            <p
              style={{
                marginTop: "1rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.6875rem",
                color: "#98a2b3",
              }}
            >
              digest {error.digest}
            </p>
          ) : null}

          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(132,233,255,0.28)",
              background: "transparent",
              color: "#84e9ff",
              fontSize: "0.875rem",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
