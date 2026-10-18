"use client";

import { useState } from "react";

export function OrgForm() {
  const [message, setMessage] = useState("");
  return (
    <form
      className="card stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/organizations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: form.get("name"),
            orgNumber: form.get("orgNumber") || null,
            address: form.get("address") || null,
            label: form.get("label") || null,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessage(data.error ?? "Kunne ikke lagre");
          return;
        }
        window.location.reload();
      }}
    >
      <h2>Ny organisasjon</h2>
      <label className="field">
        <span>Navn</span>
        <input name="name" required />
      </label>
      <label className="field">
        <span>Organisasjonsnummer</span>
        <input name="orgNumber" />
      </label>
      <label className="field">
        <span>Adresse</span>
        <input name="address" />
      </label>
      <label className="field">
        <span>Etikett</span>
        <input name="label" />
      </label>
      <button className="btn primary" type="submit">
        Lagre
      </button>
      {message ? <p className="error">{message}</p> : null}
    </form>
  );
}
