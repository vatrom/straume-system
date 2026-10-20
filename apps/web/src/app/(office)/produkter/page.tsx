import { listProducts, listSuppliers } from "@/server/catalog";
import { currentUser } from "@/server/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ImportDialog } from "./import-dialog";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { q } = await searchParams;
  const [suppliers, products] = await Promise.all([listSuppliers(), listProducts(q)]);
  return (
    <>
      <div className="top">
        <div>
          <h1>Produktkatalog</h1>
          <p className="muted">Leverandørens varer. Samme katalog skal kunne brukes av tilleggsbutikken i kundeportalen.</p>
        </div>
      </div>
      <form className="filters" action="/produkter">
        <input name="q" defaultValue={q ?? ""} placeholder="Søk varenummer, navn, NOBB eller EAN" />
        <button className="btn" type="submit">Søk</button>
      </form>
      {user.role === "admin" ? <ImportDialog suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name, format: supplier.format }))} /> : null}
      <div className="card" style={{ overflowX: "auto", marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Leverandør</th>
              <th>Varenummer</th>
              <th>NOBB</th>
              <th>EAN</th>
              <th>Navn</th>
              <th>Enhet</th>
              <th>Kostpris</th>
              <th>Veil. pris</th>
              <th>Gyldig fra</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.supplierName}</td>
                <td>{product.sku}</td>
                <td>{product.nobb ?? "–"}</td>
                <td>{product.ean ?? "–"}</td>
                <td>
                  {product.name}
                  {product.discontinued ? <div className="badge warn">Utgått</div> : null}
                  {product.costPrice == null ? <div className="badge missing">Mangler pris</div> : null}
                </td>
                <td>{product.unit}</td>
                <td>{product.costPrice?.toLocaleString("nb-NO") ?? "–"}</td>
                <td>{product.listPrice?.toLocaleString("nb-NO") ?? "–"}</td>
                <td>{product.validFrom ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 ? <p className="muted">Ingen produkter.</p> : null}
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        <Link href="/prislister">Prisposter</Link> kan peke på disse varene i en stykkliste. EFO/NELFO-kolonner ligger klare som format, og API kan bruke samme mapping senere.
      </p>
    </>
  );
}
