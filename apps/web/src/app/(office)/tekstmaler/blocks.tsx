"use client";

import { useState } from "react";

type Block = {
  key: string;
  name: string;
  section: string;
  kind: string;
  body: string;
  link: string;
  locked: boolean;
  aiSelectable: boolean;
  choiceKey: string;
  choiceValues: string;
  codes: string;
  numberKey: string;
};

export function BlockEditor({
  isAdmin,
  publishedVersion,
  draftVersion,
  sections,
}: {
  isAdmin: boolean;
  publishedVersion: number | null;
  draftVersion: number | null;
  sections: { key: string; title: string; blocks: Block[] }[];
}) {
  const [message, setMessage] = useState("");

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <strong>Tekstblokker fra tilbudsmalen</strong>
            <p className="muted">
              Publisert versjon {publishedVersion ?? "–"} brukes i nye tilbud. Utkast versjon {draftVersion ?? "–"} kan redigeres her. AI kan velge blokker og foreslå tillegg, men ikke endre standardtekstene.
            </p>
          </div>
          {isAdmin ? (
            <button
              className="btn primary"
              type="button"
              onClick={async () => {
                const response = await fetch("/api/text-blocks/publish", { method: "POST" });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                  setMessage(data.error ?? "Feil");
                  return;
                }
                window.location.reload();
              }}
            >
              Publiser utkast
            </button>
          ) : null}
        </div>
        {message ? <p>{message}</p> : null}
      </div>
      {sections.map((section) => (
        <section key={section.key} className="stack">
          <h2>{section.title}</h2>
          {section.blocks.map((block) => (
            <form
              key={block.key}
              className="card stack"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const response = await fetch(`/api/text-blocks/${encodeURIComponent(block.key)}`, {
                  method: "PUT",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    body: form.get("body"),
                    choiceKey: form.get("choiceKey"),
                    choiceValues: form.get("choiceValues"),
                    codes: form.get("codes"),
                    numberKey: form.get("numberKey"),
                  }),
                });
                const data = await response.json().catch(() => ({}));
                setMessage(response.ok ? `Lagret ${block.name}` : data.error ?? "Feil");
              }}
            >
              <div className="row">
                <strong>{block.name}</strong>
                <span className="badge">Standardtekst</span>
                {block.kind === "reservation" ? <span className="badge warn">Forbehold</span> : null}
                {block.kind === "generated" ? <span className="badge ok">Fra kalkylen</span> : null}
                {block.locked ? <span className="badge">AI kan ikke endre teksten</span> : null}
              </div>
              <p className="muted">Kobling: {block.link}</p>
              {block.kind === "generated" ? (
                <p className="muted">Produkt og antall hentes fra kalkylepostene i faget. Teksten under tas ikke med som produktliste.</p>
              ) : (
                <textarea name="body" rows={block.body.length > 280 ? 8 : 4} defaultValue={block.body} disabled={!isAdmin} />
              )}
              {block.kind === "description" ? (
                <div className="row">
                  <label className="field">
                    <span>Sjekklistenøkkel</span>
                    <input name="choiceKey" defaultValue={block.choiceKey} disabled={!isAdmin} />
                  </label>
                  <label className="field grow">
                    <span>Valg, kommaseparert</span>
                    <input name="choiceValues" defaultValue={block.choiceValues} disabled={!isAdmin} />
                  </label>
                  <label className="field">
                    <span>Varekoder</span>
                    <input name="codes" defaultValue={block.codes} disabled={!isAdmin} />
                  </label>
                  <label className="field">
                    <span>Mengdenøkkel</span>
                    <input name="numberKey" defaultValue={block.numberKey} disabled={!isAdmin} />
                  </label>
                </div>
              ) : null}
              {isAdmin && block.kind !== "generated" ? <button className="btn" type="submit">Lagre blokk</button> : null}
            </form>
          ))}
        </section>
      ))}
    </div>
  );
}
