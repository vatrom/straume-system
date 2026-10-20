"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DraftButton({ dealId, projectId }: { dealId?: string; projectId?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <button
        className="btn primary"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const response = await fetch("/api/quotes/draft", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ dealId, projectId }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              setMessage(typeof data.error === "string" && data.error.trim() ? data.error : "AI-utkast feilet: ukjent feil");
              return;
            }
            router.push(`/tilbud/${data.id}`);
          } catch {
            setMessage("AI-utkast feilet: fikk ikke kontakt med serveren");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Lager utkast…" : "Lag tilbudsutkast"}
      </button>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
