"use client";

import { useState } from "react";

export function TemplateEditor({ isAdmin, templates }: { isAdmin: boolean; templates: { key: string; name: string; kind: string; body: string }[] }) {
  const [message, setMessage] = useState("");
  return (
    <div className="stack">
      {templates.map((template) => (
        <form
          key={template.key}
          className="card stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const response = await fetch(`/api/templates/${encodeURIComponent(template.key)}`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ body: form.get("body") }),
            });
            const data = await response.json().catch(() => ({}));
            setMessage(response.ok ? `Lagret ${template.name}` : data.error ?? "Feil");
          }}
        >
          <strong>{template.name}</strong>
          <span className="muted">{template.kind} · {template.key}</span>
          <textarea name="body" rows={6} defaultValue={template.body} disabled={!isAdmin} />
          {isAdmin ? <button className="btn" type="submit">Lagre mal</button> : null}
        </form>
      ))}
      {message ? <p>{message}</p> : null}
    </div>
  );
}
