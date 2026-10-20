"use client";

import { useState } from "react";

export function ChangeDraftForm({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const description = String(new FormData(event.currentTarget).get("description") ?? "");
        let response: Response;
        try {
          response = await fetch(`/api/projects/${projectId}/changes/draft`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ description }),
          });
        } catch {
          setMessage("AI-utkast feilet: fikk ikke kontakt med serveren");
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessage(typeof data.error === "string" && data.error.trim() ? data.error : "AI-utkast feilet: ukjent feil");
          return;
        }
        setMessage(`Utkast priset til ${Number(data.totalIncVat).toLocaleString("nb-NO")} kr inkl. mva. ${(data.flags ?? []).join(" ")}`);
        window.location.reload();
      }}
    >
      <h3>Pris endring med motoren</h3>
      <textarea name="description" rows={3} required placeholder="2 downlight over servant" />
      <button className="btn" type="submit">Lag prisutkast</button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
