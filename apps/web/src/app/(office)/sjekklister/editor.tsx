"use client";

import { TRADES, type ChecklistQuestionType, type ItemConfig, type ItemRole } from "@straume/domain";
import { useState } from "react";

type Mapping = { when: string; code: string; formula: string };

export type EditorItem = {
  prompt: string;
  questionType: ChecklistQuestionType;
  required: boolean;
  choices: string;
  unit: string;
  helpText: string;
  itemKey: string;
  role: ItemRole;
  showKey: string;
  showValues: string;
  ignoreValues: string;
  gateChoices: string;
  controlsSections: boolean;
  prefill: string;
  tradeByChoice: string;
  channelByChoice: string;
  mappings: Mapping[];
};

export type EditorSection = { tradeCode: string; name: string; items: EditorItem[] };

const TYPES: { value: ChecklistQuestionType; label: string }[] = [
  { value: "text_short", label: "Kort fritekst" },
  { value: "text", label: "Lang fritekst" },
  { value: "choice", label: "Enkeltvalg" },
  { value: "multi", label: "Flervalg" },
  { value: "yes_no", label: "Ja/nei" },
  { value: "number", label: "Antall" },
  { value: "measurement", label: "Mål" },
  { value: "date", label: "Dato eller fritekst" },
  { value: "media", label: "Bilde/vedlegg" },
];

const ROLES: { value: ItemRole; label: string }[] = [
  { value: "price", label: "Pris" },
  { value: "info", label: "Info" },
  { value: "measure", label: "Mål til kalkyle" },
  { value: "gate", label: "Velger fag" },
  { value: "channel", label: "Kildetillegg" },
  { value: "lump", label: "Rund sum" },
  { value: "photo", label: "Bilde" },
];

const EMPTY: EditorItem = {
  prompt: "Nytt spørsmål",
  questionType: "text",
  required: false,
  choices: "",
  unit: "",
  helpText: "",
  itemKey: "",
  role: "info",
  showKey: "",
  showValues: "",
  ignoreValues: "",
  gateChoices: "",
  controlsSections: false,
  prefill: "",
  tradeByChoice: "",
  channelByChoice: "",
  mappings: [],
};

export function ChecklistEditor({ initial, publishedVersion, canEdit }: { initial: EditorSection[]; publishedVersion: number | null; canEdit: boolean }) {
  const [sections, setSections] = useState(initial);
  const [message, setMessage] = useState("");

  function update(index: number, next: EditorSection) {
    setSections((current) => current.map((section, i) => (i === index ? next : section)));
  }

  return (
    <div className="stack">
      <p className="muted">Publisert versjon: {publishedVersion ?? "ingen"}. Appen hopper over fag som ikke er krysset av, og viser alltid et internt notat per seksjon.</p>
      {sections.map((section, index) => (
        <section className="card stack" key={`${section.name}-${index}`}>
          <div className="row">
            <label className="field">
              <span>Fag</span>
              <select value={section.tradeCode} disabled={!canEdit} onChange={(event) => update(index, { ...section, tradeCode: event.target.value })}>
                {TRADES.map((trade) => (
                  <option key={trade.code} value={trade.code}>{trade.name}</option>
                ))}
              </select>
            </label>
            <label className="field grow">
              <span>Seksjon</span>
              <input value={section.name} disabled={!canEdit} onChange={(event) => update(index, { ...section, name: event.target.value })} />
            </label>
            <button className="btn" type="button" disabled={index === 0 || !canEdit} onClick={() => setSections(move(sections, index, -1))}>Opp</button>
            <button className="btn" type="button" disabled={index === sections.length - 1 || !canEdit} onClick={() => setSections(move(sections, index, 1))}>Ned</button>
          </div>
          {section.items.map((item, itemIndex) => (
            <ItemEditor
              key={`${item.itemKey}-${itemIndex}`}
              item={item}
              canEdit={canEdit}
              keys={sections.flatMap((row) => row.items.map((entry) => entry.itemKey).filter(Boolean))}
              onChange={(next) => {
                const items = section.items.slice();
                items[itemIndex] = next;
                update(index, { ...section, items });
              }}
              onRemove={() => update(index, { ...section, items: section.items.filter((_, i) => i !== itemIndex) })}
            />
          ))}
          {canEdit ? (
            <button className="btn" type="button" onClick={() => update(index, { ...section, items: [...section.items, { ...EMPTY, mappings: [] }] })}>
              Nytt spørsmål
            </button>
          ) : null}
        </section>
      ))}
      {canEdit ? (
        <div className="row">
          <button className="btn" type="button" onClick={() => setSections([...sections, { tradeCode: "annet", name: "Ny seksjon", items: [{ ...EMPTY, mappings: [] }] }])}>
            Ny seksjon
          </button>
          <button className="btn primary" type="button" onClick={() => void save(sections, setMessage)}>Lagre utkast</button>
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

function ItemEditor({ item, canEdit, keys, onChange, onRemove }: { item: EditorItem; canEdit: boolean; keys: string[]; onChange: (item: EditorItem) => void; onRemove: () => void }) {
  const choice = item.questionType === "choice" || item.questionType === "multi";
  return (
    <details className="stack" open={Boolean(item.mappings.length || item.showKey)} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <summary>
        <strong>{item.prompt || "Uten tekst"}</strong>
        <span className="muted"> · {TYPES.find((type) => type.value === item.questionType)?.label}{item.mappings.length ? ` · ${item.mappings.map((mapping) => mapping.code).join(", ")}` : ""}</span>
      </summary>
      <div className="row">
        <label className="field grow">
          <span>Spørsmål</span>
          <input value={item.prompt} disabled={!canEdit} onChange={(event) => onChange({ ...item, prompt: event.target.value })} />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={item.questionType} disabled={!canEdit} onChange={(event) => onChange({ ...item, questionType: event.target.value as ChecklistQuestionType })}>
            {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Enhet</span>
          <input value={item.unit} disabled={!canEdit} placeholder="m2, lm, stk" style={{ width: 90 }} onChange={(event) => onChange({ ...item, unit: event.target.value })} />
        </label>
        <label className="field">
          <span>Nøkkel</span>
          <input value={item.itemKey} disabled={!canEdit} style={{ width: 140 }} onChange={(event) => onChange({ ...item, itemKey: event.target.value })} />
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Rolle</span>
          <select value={item.role} disabled={!canEdit} onChange={(event) => onChange({ ...item, role: event.target.value as ItemRole })}>
            {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Forhåndsutfyll</span>
          <select value={item.prefill} disabled={!canEdit} onChange={(event) => onChange({ ...item, prefill: event.target.value })}>
            <option value="">Ingen</option>
            <option value="gulvareal">Gulvflate</option>
            <option value="takhoyde">Takhøyde</option>
            <option value="omkrets">Omkrets</option>
          </select>
        </label>
        <label className="field grow">
          <span>Hjelpetekst</span>
          <input value={item.helpText} disabled={!canEdit} onChange={(event) => onChange({ ...item, helpText: event.target.value })} />
        </label>
        {canEdit ? <button className="btn" type="button" onClick={onRemove}>Fjern</button> : null}
      </div>
      {choice ? (
        <label className="field">
          <span>Valg, atskilt med |</span>
          <input value={item.choices} disabled={!canEdit} onChange={(event) => onChange({ ...item, choices: event.target.value })} />
        </label>
      ) : null}
      <div className="row">
        <label className="field">
          <span>Vises når felt</span>
          <select value={item.showKey} disabled={!canEdit} onChange={(event) => onChange({ ...item, showKey: event.target.value })}>
            <option value="">Alltid</option>
            {keys.map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
        </label>
        <label className="field grow">
          <span>har en av verdiene, |</span>
          <input value={item.showValues} disabled={!canEdit || !item.showKey} onChange={(event) => onChange({ ...item, showValues: event.target.value })} />
        </label>
      </div>
      <div className="row">
        <label className="field grow">
          <span>Ikke pris disse svarene</span>
          <input value={item.ignoreValues} disabled={!canEdit} onChange={(event) => onChange({ ...item, ignoreValues: event.target.value })} />
        </label>
        <label className="field grow">
          <span>Valg som bare åpner målfelt</span>
          <input value={item.gateChoices} disabled={!canEdit} onChange={(event) => onChange({ ...item, gateChoices: event.target.value })} />
        </label>
      </div>
      {item.role === "gate" ? (
        <label className="field">
          <span>Valg = fagkode, én per linje</span>
          <textarea value={item.tradeByChoice} disabled={!canEdit} rows={3} onChange={(event) => onChange({ ...item, tradeByChoice: event.target.value, controlsSections: true })} />
        </label>
      ) : null}
      {item.role === "channel" ? (
        <label className="field">
          <span>Valg = none, byggstart eller mittanbud</span>
          <textarea value={item.channelByChoice} disabled={!canEdit} rows={3} onChange={(event) => onChange({ ...item, channelByChoice: event.target.value })} />
        </label>
      ) : null}
      <div className="stack">
        <span className="muted">Varekoder. Formel kan være svar, 1, gulvareal, omkrets eller flisareal.</span>
        {item.mappings.map((mapping, mappingIndex) => (
          <div className="row" key={mappingIndex}>
            <input value={mapping.when} disabled={!canEdit} placeholder="valg, tom = hele svaret" onChange={(event) => onChange(setMapping(item, mappingIndex, { ...mapping, when: event.target.value }))} />
            <input value={mapping.code} disabled={!canEdit} placeholder="EL-002" style={{ width: 110 }} onChange={(event) => onChange(setMapping(item, mappingIndex, { ...mapping, code: event.target.value }))} />
            <input value={mapping.formula} disabled={!canEdit} placeholder="svar" style={{ width: 140 }} onChange={(event) => onChange(setMapping(item, mappingIndex, { ...mapping, formula: event.target.value }))} />
            {canEdit ? <button className="btn" type="button" onClick={() => onChange({ ...item, mappings: item.mappings.filter((_, i) => i !== mappingIndex) })}>Fjern</button> : null}
          </div>
        ))}
        {canEdit ? <button className="btn" type="button" onClick={() => onChange({ ...item, mappings: [...item.mappings, { when: "", code: "", formula: "svar" }] })}>Ny mapping</button> : null}
      </div>
    </details>
  );
}

function setMapping(item: EditorItem, index: number, mapping: Mapping): EditorItem {
  const mappings = item.mappings.slice();
  mappings[index] = mapping;
  return { ...item, mappings };
}

function split(value: string): string[] {
  return value.split("|").map((part) => part.trim()).filter(Boolean);
}

function record(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of value.split("\n")) {
    const [key, mapped] = line.split("=").map((part) => part.trim());
    if (key && mapped) out[key] = mapped;
  }
  return out;
}

function configOf(item: EditorItem): ItemConfig {
  const config: ItemConfig = { role: item.role };
  if (item.showKey && split(item.showValues).length) config.showWhen = { itemKey: item.showKey, anyOf: split(item.showValues) };
  if (item.prefill === "gulvareal" || item.prefill === "takhoyde" || item.prefill === "omkrets") config.prefill = item.prefill;
  if (item.ignoreValues.trim()) config.ignoreValues = split(item.ignoreValues);
  if (item.gateChoices.trim()) config.gateChoices = split(item.gateChoices);
  if (item.role === "gate") {
    config.controlsSections = true;
    config.tradeByChoice = record(item.tradeByChoice);
  }
  if (item.role === "channel") config.channelByChoice = record(item.channelByChoice) as ItemConfig["channelByChoice"];
  const mappings = item.mappings.filter((mapping) => mapping.code.trim() && mapping.formula.trim());
  if (mappings.length) config.mappings = mappings.map((mapping) => ({ when: mapping.when.trim() || null, code: mapping.code.trim(), formula: mapping.formula.trim() }));
  return config;
}

async function save(sections: EditorSection[], setMessage: (value: string) => void) {
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
          helpText: item.helpText || null,
          itemKey: item.itemKey || null,
          choices: item.questionType === "choice" || item.questionType === "multi" ? split(item.choices) : null,
          config: configOf(item),
        })),
      })),
    }),
  });
  const data = await response.json().catch(() => ({}));
  setMessage(response.ok ? "Utkast lagret" : data.error ?? "Feil");
}

function move(sections: EditorSection[], index: number, delta: number) {
  const next = sections.slice();
  const [item] = next.splice(index, 1);
  if (!item) return sections;
  next.splice(index + delta, 0, item);
  return next;
}
