"use client";

import { useState } from "react";

export function PersonForm({
  organizations,
  users,
  labels,
}: {
  organizations: { id: string; name: string }[];
  users: { id: string; name: string }[];
  labels: string[];
}) {
  const [message, setMessage] = useState("");
  return (
    <form
      className="card stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/people", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            firstName: form.get("firstName"),
            lastName: form.get("lastName"),
            email: form.get("email") || null,
            phone: form.get("phone") || null,
            organizationId: form.get("organizationId") || null,
            ownerId: form.get("ownerId") || null,
            label: form.get("label") || null,
            street: form.get("street") || null,
            houseNumber: form.get("houseNumber") || null,
            postalCode: form.get("postalCode") || null,
            city: form.get("city") || null,
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
      <h2>Ny person</h2>
      <div className="row">
        <label className="field">
          <span>Fornavn</span>
          <input name="firstName" required />
        </label>
        <label className="field">
          <span>Etternavn</span>
          <input name="lastName" required />
        </label>
      </div>
      <div className="row">
        <label className="field grow">
          <span>E-post</span>
          <input name="email" type="email" />
        </label>
        <label className="field">
          <span>Telefon</span>
          <input name="phone" />
        </label>
      </div>
      <label className="field">
        <span>Organisasjon</span>
        <select name="organizationId" defaultValue="">
          <option value="">Ingen</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <label className="field">
          <span>Eier</span>
          <select name="ownerId" defaultValue="">
            <option value="">Meg</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Etikett</span>
          <select name="label" defaultValue="">
            <option value="">Ingen</option>
            {labels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <label className="field grow">
          <span>Gate</span>
          <input name="street" />
        </label>
        <label className="field">
          <span>Nr</span>
          <input name="houseNumber" />
        </label>
        <label className="field">
          <span>Postnr</span>
          <input name="postalCode" />
        </label>
        <label className="field">
          <span>Sted</span>
          <input name="city" />
        </label>
      </div>
      <button className="btn primary" type="submit">
        Lagre person
      </button>
      {message ? <p className="error">{message}</p> : null}
    </form>
  );
}
