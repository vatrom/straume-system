"use client";

import { TRADES } from "@straume/domain";
import { useState } from "react";

type Item = {
  prompt: string;
  questionType: "yes_no" | "number" | "measurement" | "choice" | "text";
  required: boolean;
  choices: string;
  unit: string;
};

type Section = { tradeCode: string; name: string; items: Item[] };

const TYPES: { value: Item["questionType"]; label: string }[] = [
  { value: "yes_no", label: "Ja/nei" },
  { value: "number", label: "Tall" },
  { value: "measurement", label: "Mål" },
  { value: "choice", label: "Valg" },
  { value: "text", label: "Tekst" },
];

export function ChecklistEditor({ initial, publishedVersion, canEdit }: { initial: Section[]; publishedVersion: number | null; canEdit: boolean }) {
  const [sections, setSections] = useState(initial);
  const [message, setMessage] = useState("");

  function update(index: number, next: Section) {
    setSections((current) => current.map((section, i) => (i === index ? next : section)));
  }

  return (
    <div className="stack">
      <p className="muted">Publisert versjon: {publishedVersion ?? "ingen"}. Fri tekst kan alltid legges til i appen, uavhengig av spørsmålene.</p>
      {sections.map((section, index) => (
        <section className="card stack" key={`${section.tradeCode}-${index}`}>
          <div className="row">
            <label className="field">
              <span>Fag</span>
              <select value={section.tradeCode} disabled={!canEdit} onChange={(event) => update(index, { ...section, tradeCode: event.target.value })}>
                {TRADES.map((trade) => (
                  <option key={trade.code} value={trade.code}>
                    {trade.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field grow">
              <span>Seksjon</span>
              <input value={section.name} disabled={!canEdit} onChange={(event) => update(index, { ...section, name: event.target.value })} />
            </label>
            <button className="btn" type="button" disabled={index === 0 || !canEdit} onClick={() => setSections(move(sections, index, -1))}>
              Opp
            </button>
            <button className="btn" type="button" disabled={index === sections.length - 1 || !canEdit} onClick={() => setSections(move(sections, index, 1))}>
              Ned
            </button>
          </div>
          {section.items.map((item, itemIndex) => (
            <div className="row" key={itemIndex}>
              <input
                value={item.prompt}
                disabled={!canEdit}
                style={{ flex: 1 }}
                onChange={(event) => {
                  const items = section.items.slice();
                  items[itemIndex] = { ...item, prompt: event.target.value };
                  update(index, { ...section, items });
                }}
              />
              <select
                value={item.questionType}
                disabled={!canEdit}
                onChange={(event) => {
                  const items = section.items.slice();
                  items[itemIndex] = { ...item, questionType: event.target.value as Item["questionType"] };
                  update(index, { ...section, items });
                }}
              >
                {TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <input
                value={item.unit}
                disabled={!canEdit}
                placeholder="enhet"
                style={{ width: 80 }}
                onChange={(event) => {
                  const items = section.items.slice();
                  items[itemIndex] = { ...item, unit: event.target.value };
                  update(index, { ...section, items });
                }}
              />
              {item.questionType === "choice" ? (
                <input
                  value={item.choices}
                  disabled={!canEdit}
                  placeholder="valg, atskilt med |"
                  onChange={(event) => {
                    const items = section.items.slice();
                    items[itemIndex] = { ...item, choices: event.target.value };
                    update(index, { ...section, items });
                  }}
                />
              ) : null}
            </div>
          ))}
          {canEdit ? (
            <button
              className="btn"
              type="button"
              onClick={() => update(index, { ...section, items: [...section.items, { prompt: "Nytt spørsmål", questionType: "yes_no", required: false, choices: "", unit: "" }] })}
            >
              Nytt spørsmål
            </button>
          ) : null}
        </section>
      ))}
      {canEdit ? (
        <div className="row">
          <button
            className="btn"
            type="button"
            onClick={() => setSections([...sections, { tradeCode: "annet", name: "Ny seksjon", items: [{ prompt: "Nytt spørsmål", questionType: "text", required: false, choices: "", unit: "" }] }])}
          >
            Ny seksjon
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              const response = await fetch("/api/checklists/draft", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  sections: sections.map((section) => ({
                    tradeCode: section.tradeCode,
                    name: section.name,
                    items: section.items.map((item) => ({
                      prompt: item.prompt,
                      questionType: item.questionType,
                      required: item.required,
                      unit: item.unit || null,
                      choices: item.questionType === "choice" ? item.choices.split("|").map((part) => part.trim()).filter(Boolean) : null,
                    })),
                  })),
                }),
              });
              const data = await response.json().catch(() => ({}));
              setMessage(response.ok ? "Utkast lagret" : data.error ?? "Feil");
            }}
          >
            Lagre utkast
          </button>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const response = await fetch("/api/checklists/publish", { method: "POST" });
              const data = await response.json().catch(() => ({}));
              if (!response.ok) {
                setMessage(data.error ?? "Feil");
                return;
              }
              window.location.reload();
            }}
          >
            Publiser
          </button>
        </div>
      ) : null}
      {message ? <p>{message}</p> : null}
    </div>
  );
}

function move(sections: Section[], index: number, delta: number) {
  const next = sections.slice();
  const [item] = next.splice(index, 1);
  if (!item) return sections;
  next.splice(index + delta, 0, item);
  return next;
}
