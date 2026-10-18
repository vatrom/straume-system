"use client";

import { useState } from "react";

type Diff = {
  sku: string;
  name: string;
  kind: string;
  oldCost: number | null;
  newCost: number | null;
  oldList: number | null;
  newList: number | null;
};

const KIND: Record<string, string> = {
  new: "Ny",
  cost: "Endret kostpris",
  list: "Endret veil. pris",
  unchanged: "Uendret",
  discontinued: "Utgått",
  missing_price: "Mangler pris",
};

const SAMPLE = `varenummer;navn;enhet;kostpris;veilpris;nobb;ean
FR-100;Servantbatteri;stk;940;1590;10000001;7000000000011
FR-200;Slukrist;stk;240;420;10000002;7000000000028
FR-500;Hjørneventil;stk;180;290;;;
`;

export function ImportDialog({ suppliers }: { suppliers: { id: string; name: string; format: string }[] }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [text, setText] = useState(SAMPLE);
  const [fileName, setFileName] = useState("fiktiv-ror-ny.csv");
  const [diff, setDiff] = useState<Diff[] | null>(null);
  const [message, setMessage] = useState("");

  async function preview() {
    setMessage("");
    const response = await fetch(`/api/suppliers/${supplierId}/import/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName, text }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error ?? "Feil");
      return;
    }
    setDiff(data.diff ?? []);
  }

  async function apply() {
    const response = await fetch(`/api/suppliers/${supplierId}/import/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName, text }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error ?? "Feil");
      return;
    }
    window.location.reload();
  }

  return (
    <section className="card stack" style={{ marginTop: 16 }}>
      <h2>Importer prisfil</h2>
      <p className="muted">Kolonnemappingen er lagret på leverandøren. CSV og Excel leses nå. EFO og NELFO har ferdige kolonnenavn, og samme modell kan ta imot API senere.</p>
      <div className="row">
        <label className="field">
          <span>Leverandør</span>
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.format}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Filnavn</span>
          <input value={fileName} onChange={(event) => setFileName(event.target.value)} />
        </label>
      </div>
      <textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} />
      <div className="row">
        <button className="btn" type="button" onClick={() => void preview()}>Vis diff</button>
        <button className="btn primary" type="button" disabled={!diff} onClick={() => void apply()}>Oppdater produkter</button>
      </div>
      {message ? <p>{message}</p> : null}
      {diff ? (
        <table>
          <thead>
            <tr>
              <th>Varenummer</th>
              <th>Navn</th>
              <th>Endring</th>
              <th>Kost før</th>
              <th>Kost etter</th>
            </tr>
          </thead>
          <tbody>
            {diff.map((row) => (
              <tr key={row.sku}>
                <td>{row.sku}</td>
                <td>{row.name}</td>
                <td><span className={row.kind === "cost" || row.kind === "new" ? "badge warn" : "badge ok"}>{KIND[row.kind] ?? row.kind}</span></td>
                <td>{row.oldCost ?? "–"}</td>
                <td>{row.newCost ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
