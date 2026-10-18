"use client";

import { useState } from "react";

export function NewPipeline() {
  const [name, setName] = useState("");
  const [perDeal, setPerDeal] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="card row"
      onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch("/api/pipelines", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, dealProbabilityEnabled: perDeal }),
        });
        const data = await response.json();
        if (!response.ok) {
          setMessage(data.error ?? "Feil");
          return;
        }
        window.location.reload();
      }}
    >
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ny pipeline" required />
      <label className="row">
        <input type="checkbox" checked={perDeal} onChange={(event) => setPerDeal(event.target.checked)} />
        Sannsynlighet per avtale
      </label>
      <button className="btn primary" type="submit">
        Opprett pipeline
      </button>
      {message ? <span>{message}</span> : null}
    </form>
  );
}
