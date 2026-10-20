"use client";

import { fieldVisible, sectionVisible, selectedTrades, type ItemConfig } from "@straume/domain";
import { useMemo, useState } from "react";

type FormItem = {
  id: string;
  prompt: string;
  questionType: string;
  choices: string[] | null;
  unit: string | null;
  helpText: string | null;
  itemKey: string | null;
  config: ItemConfig | null;
  value: unknown;
  freeText: string;
  internalNote: string;
};

type FormSection = { name: string; tradeCode: string; items: FormItem[] };

export type InspectionFormData = {
  id: string;
  title: string;
  sections: FormSection[];
};

export function InspectionForm({ form }: { form: InspectionFormData }) {
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(form.sections.flatMap((section) => section.items.map((item) => [item.id, item.value]))));
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(form.sections.flatMap((section) => section.items.map((item) => [item.id, item.internalNote]))));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const valueMap = useMemo(() => {
    const map = new Map<string, unknown>();
    for (const section of form.sections) {
      for (const item of section.items) {
        if (item.itemKey) map.set(item.itemKey, values[item.id]);
      }
    }
    return map;
  }, [form.sections, values]);

  const selected = selectedTrades(
    form.sections.flatMap((section) =>
      section.items.map((item) => ({
        key: item.itemKey,
        prompt: item.prompt,
        tradeCode: section.tradeCode,
        questionType: item.questionType,
        value: valueMap.get(item.itemKey ?? "") ?? null,
        config: item.config,
      })),
    ),
  );
  const visible = form.sections.filter((section) => sectionVisible(section.tradeCode, selected));

  async function save() {
    setPending(true);
    setError("");
    setMessage("");
    const answers = visible.flatMap((section) =>
      section.items
        .filter((item) => item.questionType !== "media" && fieldVisible(item, valueMap))
        .map((item) => ({ itemId: item.id, value: values[item.id] ?? null, internalNote: notes[item.id]?.trim() || null })),
    );
    const response = await fetch(`/api/inspections/${form.id}/answers`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "Kunne ikke lagre befaringen");
      return;
    }
    setMessage("Befaringen er lagret.");
  }

  return (
    <div className="stack">
      {visible.map((section) => {
        const items = section.items.filter((item) => fieldVisible(item, valueMap));
        if (items.length === 0) return null;
        return (
          <section className="card stack" key={section.name}>
            <h2>{section.name}</h2>
            {items.map((item) => (
              <label className="field stack" key={item.id}>
                <span>{item.prompt}{item.unit ? ` (${item.unit})` : ""}</span>
                {item.helpText ? <span className="muted">{item.helpText}</span> : null}
                <Answer item={item} value={values[item.id]} onChange={(value) => setValues((current) => ({ ...current, [item.id]: value }))} />
                {item.questionType === "media" ? null : (
                  <input
                    value={notes[item.id] ?? ""}
                    placeholder="Internt notat"
                    onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                  />
                )}
              </label>
            ))}
          </section>
        );
      })}
      <button className="btn primary" type="button" disabled={pending} onClick={() => void save()}>
        {pending ? "Lagrer …" : "Lagre befaring"}
      </button>
      {message ? <p>{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

function Answer({ item, value, onChange }: { item: FormItem; value: unknown; onChange: (value: unknown) => void }) {
  if (item.questionType === "yes_no") {
    return (
      <span style={{ display: "flex", gap: 12 }}>
        <label><input type="radio" checked={value === true} onChange={() => onChange(true)} /> Ja</label>
        <label><input type="radio" checked={value === false} onChange={() => onChange(false)} /> Nei</label>
      </span>
    );
  }
  if (item.questionType === "choice") {
    return (
      <select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Velg</option>
        {(item.choices ?? []).map((choice) => (
          <option key={choice} value={choice}>{choice}</option>
        ))}
      </select>
    );
  }
  if (item.questionType === "multi") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <span className="stack">
        {(item.choices ?? []).map((choice) => {
          const on = selected.includes(choice);
          return (
            <label key={choice}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? selected.filter((entry) => entry !== choice) : [...selected, choice])}
              />{" "}
              {choice}
            </label>
          );
        })}
      </span>
    );
  }
  if (item.questionType === "media") return <span className="muted">Bilder tas i befaring-appen.</span>;
  if (item.questionType === "number" || item.questionType === "measurement") {
    return (
      <input
        inputMode="decimal"
        value={value == null || value === "" ? "" : String(value)}
        onChange={(event) => {
          const text = event.target.value.replace(",", ".");
          onChange(text.trim() === "" ? null : Number(text));
        }}
      />
    );
  }
  return (
    <input
      value={value == null ? "" : String(value)}
      placeholder={item.questionType === "date" ? "For eksempel etter nyttår" : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
