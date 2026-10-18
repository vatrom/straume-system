"use client";

import { useState } from "react";

type Stage = { id: string; name: string; probability?: number; rottenDays?: number | null; sortOrder: number };

export function StageEditor({
  title,
  apiBase,
  initial,
  withProbability,
}: {
  title: string;
  apiBase: string;
  initial: Stage[];
  withProbability: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [probability, setProbability] = useState(20);
  const [rottenDays, setRottenDays] = useState<string>("");

  async function call(path: string, method: string, body?: unknown) {
    const response = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Feil");
    return data;
  }

  async function refresh() {
    window.location.reload();
  }

  async function move(index: number, delta: number, all: Stage[]) {
    const ordered = all.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const next = ordered.slice();
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    try {
      await call(`${apiBase}/reorder`, "POST", { ids: next.map((row) => row.id) });
      setRows(next.map((row, sortOrder) => ({ ...row, sortOrder })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Feil");
    }
  }

  return (
    <div className="card stack">
      <h2>{title}</h2>
      {rows
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row, index, all) => (
          <form
            key={row.id}
            className="row"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              try {
                const rotten = String(form.get("rottenDays") ?? "");
                await call(`/api/${withProbability ? "stages" : "phases"}/${row.id}`, "PATCH", {
                  name: form.get("name"),
                  probability: withProbability ? Number(form.get("probability")) : undefined,
                  rottenDays: withProbability ? (rotten === "" ? null : Number(rotten)) : undefined,
                });
                setMessage("Lagret");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Feil");
              }
            }}
          >
            <input name="name" defaultValue={row.name} />
            {withProbability ? <input name="probability" type="number" min={0} max={100} defaultValue={row.probability ?? 0} style={{ width: 80 }} /> : null}
            {withProbability ? (
              <input name="rottenDays" type="number" min={1} placeholder="dager" defaultValue={row.rottenDays ?? ""} style={{ width: 90 }} />
            ) : null}
            <button className="btn" type="submit">
              Lagre
            </button>
            <button
              className="btn"
              type="button"
              disabled={index === 0}
              onClick={() => move(index, -1, all)}
            >
              Opp
            </button>
            <button className="btn" type="button" disabled={index === all.length - 1} onClick={() => move(index, 1, all)}>
              Ned
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={async () => {
                try {
                  await call(`/api/${withProbability ? "stages" : "phases"}/${row.id}`, "DELETE");
                  await refresh();
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Feil");
                }
              }}
            >
              Slett
            </button>
          </form>
        ))}
      <form
        className="row"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await call(`${apiBase}/${withProbability ? "stages" : "phases"}`, "POST", {
              name,
              probability,
              rottenDays: rottenDays === "" ? null : Number(rottenDays),
            });
            setName("");
            await refresh();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Feil");
          }
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ny fase" required />
        {withProbability ? <input type="number" value={probability} onChange={(event) => setProbability(Number(event.target.value))} /> : null}
        {withProbability ? <input value={rottenDays} onChange={(event) => setRottenDays(event.target.value)} placeholder="stagnasjonsdager" /> : null}
        <button className="btn primary" type="submit">
          Legg til fase
        </button>
      </form>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
