import { itemBom } from "@/server/catalog";
import { currentUser } from "@/server/auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BomEditor } from "./editor";

export default async function BomPage({ params }: { params: Promise<{ id: string; code: string }> }) {
  const { id, code } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect(`/prislister/${id}`);
  let bom;
  try {
    bom = await itemBom(id, code);
  } catch {
    notFound();
  }
  return (
    <>
      <div className="top">
        <div>
          <p className="muted">
            <Link href={`/prislister/${id}`}>Prisliste</Link>
          </p>
          <h1>{bom.item.code} · {bom.item.name}</h1>
          <p className="muted">
            Materialkost {bom.rollup ? `${bom.rollup.materialCost.toLocaleString("nb-NO")} kr` : `${bom.item.materialCost.toLocaleString("nb-NO")} kr, enkel sum`}
            {" · "}påslag {bom.item.materialMarkup ?? "fagstandard"} · {bom.item.hoursPerUnit.toLocaleString("nb-NO")} timer per {bom.item.unit}
          </p>
        </div>
      </div>
      {bom.rollup?.flags.length ? (
        <div className="card stack" style={{ marginBottom: 16 }}>
          {bom.rollup.flags.map((flag) => (
            <div key={flag.lineId} className="badge warn">{flag.message}</div>
          ))}
        </div>
      ) : null}
      <BomEditor listId={id} itemId={bom.item.id} lines={bom.lines} products={bom.products} />
    </>
  );
}
