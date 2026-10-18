"use client";

import { useState } from "react";

type Line = {
  id: string;
  kind: string;
  label: string | null;
  amountNok: number | null;
  quantity: number;
  productId: string | null;
};

type Product = { id: string; label: string; costPrice: number | null; discontinued: boolean };

export function BomEditor({ listId, itemId, lines, products }: { listId: string; itemId: string; lines: Line[]; products: Product[] }) {
  const [rows, setRows] = useState(lines);
  const [message, setMessage] = useState("");

  function update(index: number, patch: Partial<Line>) {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="stack">
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Produkt eller tekst</th>
              <th>Mengde per enhet</th>
              <th>Beløp</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td>
                  <select value={row.kind} onChange={(event) => update(index, { kind: event.target.value })}>
                    <option value="product">Produkt</option>
                    <option value="amount">Fri sum</option>
                  </select>
                </td>
                <td>
                  {row.kind === "product" ? (
                    <select value={row.productId ?? ""} onChange={(event) => update(index, { productId: event.target.value })}>
                      <option value="">Velg produkt</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.label}
                          {product.discontinued ? " · utgått" : ""}
                          {product.costPrice == null ? " · mangler pris" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={row.label ?? ""} onChange={(event) => update(index, { label: event.target.value })} />
                  )}
                </td>
                <td>
                  <input type="number" step="0.01" value={row.quantity} onChange={(event) => update(index, { quantity: Number(event.target.value) })} style={{ width: 90 }} />
                </td>
                <td>
                  {row.kind === "amount" ? (
                    <input type="number" step="0.01" value={row.amountNok ?? 0} onChange={(event) => update(index, { amountNok: Number(event.target.value) })} style={{ width: 100 }} />
                  ) : (
                    <span className="muted">fra katalog</span>
                  )}
                </td>
                <td>
                  <button className="btn ghost" type="button" onClick={() => setRows(rows.filter((_, i) => i !== index))}>
                    Fjern
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button className="btn" type="button" onClick={() => setRows([...rows, { id: `ny-${rows.length}`, kind: "amount", label: "", amountNok: 0, quantity: 1, productId: null }])}>
          Fri sum
        </button>
        <button className="btn" type="button" onClick={() => setRows([...rows, { id: `ny-${rows.length}`, kind: "product", label: null, amountNok: null, quantity: 1, productId: products[0]?.id ?? null }])}>
          Produktlinje
        </button>
        <button
          className="btn primary"
          type="button"
          onClick={async () => {
            const response = await fetch(`/api/price-lists/${listId}/items/${itemId}/bom`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                lines: rows.map((row) => ({
                  kind: row.kind,
                  label: row.label,
                  amountNok: row.amountNok,
                  productId: row.productId,
                  quantity: row.quantity,
                })),
              }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              setMessage(data.error ?? "Feil");
              return;
            }
            window.location.reload();
          }}
        >
          Lagre stykkliste
        </button>
      </div>
      {message ? <p>{message}</p> : null}
      <p className="muted">Tom stykkliste beholder den enkle materialsummen. Poster med linjer får materialkost fra katalogen, med påslaget som ligger på posten. Tilbud som allerede er laget beholder enhetsprisen de fikk.</p>
    </div>
  );
}
