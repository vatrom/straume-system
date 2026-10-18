import { nok } from "@/lib/format";
import { quoteView } from "@/server/quotes";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function QuotePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let quote;
  try {
    quote = await quoteView(id);
  } catch {
    notFound();
  }
  const lines = quote.lines.filter((line) => line.included && !line.internal);
  return (
    <>
      <p className="muted"><Link href={`/tilbud/${quote.id}`}>Tilbake til tilbudet</Link></p>
      <article className="card stack" style={{ maxWidth: 760, margin: "16px auto", padding: 32 }}>
        <div className="mark">SV</div>
        <h1>Straume Våtrom</h1>
        <h2>{quote.title}</h2>
        <p>Revisjon {quote.revision}</p>
        <div style={{ whiteSpace: "pre-wrap" }}>{quote.customerText}</div>
        <table>
          <thead>
            <tr><th>Beskrivelse</th><th>Mengde</th></tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}><td>{line.description}</td><td>{line.quantity.toLocaleString("nb-NO")} {line.unit}</td></tr>
            ))}
          </tbody>
        </table>
        <p><strong>Totalt inkludert mva: {nok(quote.totalIncVat)}</strong></p>
        <div style={{ whiteSpace: "pre-wrap" }}>{quote.reservations}</div>
      </article>
    </>
  );
}
