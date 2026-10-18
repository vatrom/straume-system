import { listPriceLists } from "@/server/price-admin";
import Link from "next/link";

const STATUS: Record<string, string> = { draft: "Utkast", active: "Aktiv", archived: "Arkivert" };

export default async function PriceListsPage() {
  const lists = await listPriceLists();
  return (
    <>
      <div className="top">
        <div>
          <h1>Prislister</h1>
          <p className="muted">Versjoner med gyldig fra og til. Årsjustering lager en ny versjon.</p>
        </div>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Navn</th>
              <th>Gyldig</th>
              <th>Status</th>
              <th>Linjer</th>
              <th>Justering</th>
            </tr>
          </thead>
          <tbody>
            {lists.map((list) => (
              <tr key={list.id}>
                <td>
                  <Link href={`/prislister/${list.id}`}>{list.name}</Link>
                </td>
                <td>
                  {list.validFrom}
                  {list.validTo ? ` – ${list.validTo}` : " –"}
                </td>
                <td>
                  <span className={list.status === "active" ? "badge ok" : "badge"}>{STATUS[list.status] ?? list.status}</span>
                </td>
                <td>{list.lines}</td>
                <td>{list.adjustmentPercent == null ? "–" : `${list.adjustmentPercent} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
