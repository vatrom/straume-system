import { priceListView } from "@/server/price-admin";
import { currentUser } from "@/server/auth";
import Link from "next/link";
import { PriceEditor } from "./editor";

export default async function PriceListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const list = await priceListView(id);
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
    </>
  );
}
