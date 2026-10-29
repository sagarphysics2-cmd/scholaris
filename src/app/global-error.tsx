"use client";

/** Last-resort error boundary (replaces the root layout when it fails). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Scholaris is having trouble</h1>
          <p style={{ color: "#666" }}>A server error occurred. Please try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "10px 18px", borderRadius: 8, border: 0, background: "#4f46e5", color: "white", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
