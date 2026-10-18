import { nok } from "@/lib/format";
import { quoteView } from "@/server/quotes";
import { TRADES } from "@straume/domain";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteEditor } from "./editor";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let quote;
  try {
    quote = await quoteView(id);
  } catch {
    notFound();
  }
  const hours = TRADES.map((trade) => ({ name: trade.name, hours: quote.hoursByTrade[trade.code] ?? 0 })).filter((trade) => trade.hours > 0);
  return (
    <>
      <div className="top">
        <div>
          <p className="muted">
            {quote.dealId ? <Link href={`/avtaler/${quote.dealId}`}>Avtale</Link> : null}
            {quote.projectId ? <> · <Link href={`/prosjekter/${quote.projectId}`}>Prosjekt</Link></> : null}
          </p>
          <h1>{quote.title} · rev. {quote.revision}</h1>
          <p>{quote.statusLabel} · {quote.priceListName}{quote.ai ? ` · ${quote.ai.provider}` : ""}</p>
        </div>
        <div className="row">
          <Link className="btn" href={`/tilbud/${quote.id}/forhandsvisning`}>Forhåndsvis PDF</Link>
          <a className="btn" href={`/api/quotes/${quote.id}/pdf`}>Last ned PDF</a>
        </div>
      </div>
      <div className="kpis">
        <div className="card kpi"><div className="label">Eks. mva</div><strong>{nok(quote.sumExVat)}</strong></div>
        <div className="card kpi"><div className="label">Inkl. mva</div><strong>{nok(quote.totalIncVat)}</strong></div>
        <div className="card kpi"><div className="label">Dekningsbidrag eks. mva</div><strong>{nok(quote.contributionExVat)}</strong></div>
        <div className="card kpi"><div className="label">Margin eks. mva</div><strong>{(quote.marginExVat * 100).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %</strong></div>
        <div className="card kpi"><div className="label">Timer</div><strong>{quote.hoursTotal.toLocaleString("nb-NO")}</strong></div>
      </div>
      <section className="card" style={{ margin: "16px 0" }}>
        <h2>Planlagte timer</h2>
        {hours.length === 0 ? <p className="muted">Ingen timer er fordelt på fag. Poster med bare salgspris, typisk elektriker, står med 0 timer til de splittes.</p> : null}
        <div className="row">
          {hours.map((trade) => (
            <div key={trade.name}><strong>{trade.name}</strong> {trade.hours.toLocaleString("nb-NO")} t</div>
          ))}
        </div>
      </section>
      {quote.flags.length ? (
        <section className="card stack" style={{ marginBottom: 16 }}>
          <h2>Usikkerhet</h2>
          {quote.flags.map((flag) => <div key={flag} className="badge warn">{flag}</div>)}
        </section>
      ) : null}
      <QuoteEditor quote={quote} />
    </>
  );
}
