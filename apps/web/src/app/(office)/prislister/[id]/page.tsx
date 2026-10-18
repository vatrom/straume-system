import { priceChangeLog, priceListView } from "@/server/price-admin";
import { currentUser } from "@/server/auth";
import Link from "next/link";
import { PriceEditor } from "./editor";

export default async function PriceListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const list = await priceListView(id);
  const log = await priceChangeLog(id);
  const flagged = list.lines.filter((line) => line.bomFlags.length || line.splitConfidence === "uncertain");
  return (
    <>
      <div className="top">
        <div>
          <p className="muted">
            <Link href="/prislister">Prislister</Link>
          </p>
          <h1>{list.name}</h1>
          <p className="muted">
            {list.validFrom}
            {list.validTo ? ` – ${list.validTo}` : ""} · {list.status} · {list.lines.length} poster
          </p>
        </div>
      </div>
      <div className="kpis">
        {list.hoursByTrade.map((trade) => (
          <div className="card kpi" key={trade.tradeCode}>
            <div className="label">{trade.name}</div>
            <strong>{trade.hours.toLocaleString("nb-NO")} t</strong>
            <div className="muted">timer per enhet, summert</div>
          </div>
        ))}
      </div>
      {flagged.length ? (
        <p className="muted" style={{ marginTop: 12 }}>
          {flagged.length} poster er merket fordi splittet er usikkert, eller fordi stykklisten peker på utgått vare eller mangler pris.
        </p>
      ) : null}
      {user?.role === "admin" ? (
        <PriceEditor
          listId={list.id}
          status={list.status}
          lines={list.lines.map((line) => ({
            itemId: line.itemId,
            code: line.code,
            tradeCode: line.tradeCode,
            name: line.name,
            unit: line.unit,
            materialCost: line.materialCost,
            materialMarkup: line.materialMarkup,
            hoursPerUnit: line.hoursPerUnit,
            salePriceOverride: line.salePriceOverride,
            salePriceExVat: line.salePriceExVat,
            splitConfidence: line.splitConfidence ?? "known",
            splitNote: line.splitNote ?? null,
            hasBom: line.hasBom,
            bomFlags: line.bomFlags,
            active: line.active,
          }))}
        />
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Kode</th>
                <th>Post</th>
                <th>Enhet</th>
                <th>Salgspris eks. mva</th>
              </tr>
            </thead>
            <tbody>
              {list.lines.map((line) => (
                <tr key={line.itemId}>
                  <td>{line.code}</td>
                  <td>{line.name}</td>
                  <td>{line.unit}</td>
                  <td>{line.salePriceExVat.toLocaleString("nb-NO")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="card stack" style={{ marginTop: 16 }}>
        <h2>Endringslogg</h2>
        {log.length === 0 ? <p className="muted">Ingen endringer er logget på denne versjonen ennå.</p> : null}
        {log.map((entry) => (
          <div key={entry.id}>
            <strong>{entry.action}</strong>
            <span className="muted"> · {entry.actorName} · {entry.createdAt.slice(0, 16).replace("T", " ")}{entry.priceItemId ? ` · ${entry.priceItemId}` : ""}</span>
          </div>
        ))}
      </section>
    </>
  );
}
