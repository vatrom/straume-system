"use client";

import { useState } from "react";

export function GoalForm({ sellers, isAdmin, initialPeers }: { sellers: { id: string; name: string }[]; isAdmin: boolean; initialPeers: boolean }) {
  const [message, setMessage] = useState("");
  const [peers, setPeers] = useState(initialPeers);
  if (!isAdmin) return <p className="muted">Administrator setter mål. Du ser fremdriften på dashbordet.</p>;
  return (
    <div className="stack">
      <form
        className="card stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const response = await fetch("/api/insights/goals", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ownerId: form.get("ownerId") || null,
              periodStart: form.get("periodStart"),
              periodEnd: form.get("periodEnd"),
              metric: form.get("metric"),
              target: Number(form.get("target")),
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            setMessage(data.error ?? "Kunne ikke lagre målet");
            return;
          }
          window.location.reload();
        }}
      >
        <h2>Nytt mål</h2>
        <div className="row">
          <label className="field">
            <span>Hvem</span>
            <select name="ownerId" defaultValue="">
              <option value="">Hele selskapet</option>
              {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Fra</span><input name="periodStart" type="date" required defaultValue="2026-01-01" /></label>
          <label className="field"><span>Til</span><input name="periodEnd" type="date" required defaultValue="2026-12-31" /></label>
          <label className="field">
            <span>Type</span>
            <select name="metric" defaultValue="sum">
              <option value="sum">Sum</option>
              <option value="count">Antall</option>
            </select>
          </label>
          <label className="field"><span>Mål</span><input name="target" type="number" required min={1} /></label>
        </div>
        <button className="btn primary" type="submit">Lagre mål</button>
        {message ? <p className="error">{message}</p> : null}
      </form>
      <form
        className="card row"
        onSubmit={async (event) => {
          event.preventDefault();
          await fetch("/api/insights/peers", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled: peers }),
          });
          setMessage(peers ? "Selgere ser hverandres tall." : "Selgere ser bare egne tall.");
        }}
      >
        <label className="field">
          <span>Selgere ser hverandre</span>
          <select value={peers ? "1" : "0"} onChange={(event) => setPeers(event.target.value === "1")}>
            <option value="0">Bare egne tall</option>
            <option value="1">Alle selgere</option>
          </select>
        </label>
        <button className="btn" type="submit">Lagre tilgang</button>
      </form>
    </div>
  );
}
