"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Line = {
  id: string;
  code: string | null;
  tradeName: string;
  description: string;
  unit: string;
  quantity: number;
  unitPriceExVat: number;
  hours: number;
  lineSumExVat: number;
  included: boolean;
  optional: boolean;
  uncertain: boolean;
  uncertaintyNote: string | null;
  rationale: string | null;
};

type Quote = {
  id: string;
  status: string;
  title: string;
  customerText: string;
  reservations: string;
  emailSubject: string;
  emailBody: string;
  channelCode: string;
  lines: Line[];
  events: { id: string; actorName: string; fromStatus: string | null; toStatus: string | null; createdAt: string; note: string | null }[];
  family: { id: string; revision: string; status: string }[];
};

const NEXT: Record<string, { to: string; label: string }[]> = {
  draft: [{ to: "pending_approval", label: "Send til godkjenning" }],
  pending_approval: [
    { to: "approved", label: "Godkjenn" },
    { to: "draft", label: "Tilbake til utkast" },
  ],
  approved: [{ to: "sent", label: "Marker som sendt" }],
  sent: [
    { to: "accepted", label: "Akseptert" },
    { to: "rejected", label: "Avslått" },
  ],
};

export function QuoteEditor({ quote }: { quote: Quote }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const editable = quote.status === "draft" || quote.status === "pending_approval";

  async function send(path: string, method: string, body?: unknown) {
    const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Feil");
    return data;
  }

  return (
    <div className="stack">
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Fag</th>
              <th>Post</th>
              <th>Mengde</th>
              <th>Enhetspris</th>
              <th>Timer</th>
              <th>Sum</th>
              <th>Med</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.tradeName}</td>
                <td>
                  <div>{line.code}</div>
                  <input id={`d-${line.id}`} defaultValue={line.description} disabled={!editable} />
                  {line.rationale ? <div className="muted">Begrunnelse: {line.rationale}</div> : null}
                  {line.uncertain ? <div className="badge warn">{line.uncertaintyNote || "Usikker"}</div> : null}
                </td>
                <td><input id={`q-${line.id}`} type="number" step="0.01" defaultValue={line.quantity} style={{ width: 80 }} disabled={!editable} /></td>
                <td><input id={`p-${line.id}`} type="number" step="0.01" defaultValue={line.unitPriceExVat} style={{ width: 100 }} disabled={!editable} /></td>
                <td>{line.hours.toLocaleString("nb-NO")}</td>
                <td>{line.lineSumExVat.toLocaleString("nb-NO")}</td>
                <td>
                  <input id={`i-${line.id}`} type="checkbox" defaultChecked={line.included} disabled={!editable} />
                  {editable ? (
                    <button className="btn ghost" type="button" onClick={async () => {
                      try {
                        await send(`/api/quotes/${quote.id}/lines/${line.id}`, "DELETE");
                        window.location.reload();
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : "Feil");
                      }
                    }}>Fjern</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? (
        <form className="card row" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await send(`/api/quotes/${quote.id}/lines`, "POST", { code: form.get("code"), quantity: Number(form.get("quantity") || 1) });
            window.location.reload();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Feil");
          }
        }}>
          <label className="field"><span>Legg til kode</span><input name="code" required placeholder="TOM-050" /></label>
          <label className="field"><span>Mengde</span><input name="quantity" type="number" step="0.01" defaultValue={1} /></label>
          <button className="btn" type="submit">Legg til</button>
          <button className="btn primary" type="button" onClick={async () => {
            try {
              await send(`/api/quotes/${quote.id}`, "PATCH", {
                customerText: (document.getElementById("customer") as HTMLTextAreaElement).value,
                reservations: (document.getElementById("reservations") as HTMLTextAreaElement).value,
                emailSubject: (document.getElementById("subject") as HTMLInputElement).value,
                emailBody: (document.getElementById("email") as HTMLTextAreaElement).value,
                lines: quote.lines.map((line) => ({
                  id: line.id,
                  description: (document.getElementById(`d-${line.id}`) as HTMLInputElement).value,
                  quantity: Number((document.getElementById(`q-${line.id}`) as HTMLInputElement).value),
                  unitPriceExVat: Number((document.getElementById(`p-${line.id}`) as HTMLInputElement).value),
                  included: (document.getElementById(`i-${line.id}`) as HTMLInputElement).checked,
                })),
              });
              setMessage("Lagret");
              router.refresh();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Feil");
            }
          }}>Lagre tilbud</button>
        </form>
      ) : null}
      <label className="field">
        <span>Kundetekst</span>
        <textarea id="customer" rows={8} defaultValue={quote.customerText} disabled={!editable} />
      </label>
      <label className="field">
        <span>Forbehold</span>
        <textarea id="reservations" rows={5} defaultValue={quote.reservations} disabled={!editable} />
      </label>
      <label className="field">
        <span>E-postemne</span>
        <input id="subject" defaultValue={quote.emailSubject} disabled={!editable} />
      </label>
      <label className="field">
        <span>E-post</span>
        <textarea id="email" rows={6} defaultValue={quote.emailBody} disabled={!editable} />
      </label>
      <div className="row">
        {(NEXT[quote.status] ?? []).map((step) => (
          <button key={step.to} className="btn primary" type="button" onClick={async () => {
            try {
              await send(`/api/quotes/${quote.id}/transition`, "POST", { to: step.to });
              window.location.reload();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Feil");
            }
          }}>{step.label}</button>
        ))}
        <button className="btn" type="button" onClick={async () => {
          try {
            const data = await send(`/api/quotes/${quote.id}/revision`, "POST");
            router.push(`/tilbud/${data.id}`);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Feil");
          }
        }}>Ny revisjon</button>
        {quote.status === "approved" || quote.status === "sent" ? (
          <button className="btn" type="button" onClick={async () => {
            try {
              await send(`/api/quotes/${quote.id}/email`, "POST");
              setMessage("Lagt i utboks. Ingenting er sendt ut av huset.");
              router.refresh();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Feil");
            }
          }}>Legg e-post i utboks</button>
        ) : null}
      </div>
      <section className="card">
        <h2>Revisjoner</h2>
        {quote.family.map((item) => (
          <div key={item.id}><a href={`/tilbud/${item.id}`}>Rev. {item.revision}</a> · {item.status}</div>
        ))}
        <h2>Logg</h2>
        {quote.events.map((event) => (
          <div key={event.id} className="muted">{event.createdAt.slice(0, 16).replace("T", " ")} · {event.actorName} · {event.fromStatus ?? "–"} → {event.toStatus}{event.note ? ` · ${event.note}` : ""}</div>
        ))}
      </section>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
