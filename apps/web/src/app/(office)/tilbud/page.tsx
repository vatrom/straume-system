import { nok } from "@/lib/format";
import { listQuotes } from "@/server/quotes";
import { QUOTE_STATUS_LABEL, type QuoteFlowStatus } from "@straume/domain";
import Link from "next/link";

const STATUSES: { value: string; label: string }[] = [
  { value: "all", label: "Alle statuser" },
  { value: "draft", label: "Utkast" },
  { value: "pending_approval", label: "Til godkjenning" },
  { value: "internally_approved", label: "Internt godkjent" },
  { value: "approved", label: "Godkjent" },
  { value: "sent", label: "Sendt" },
  { value: "signed", label: "Signert" },
  { value: "accepted", label: "Akseptert" },
  { value: "rejected", label: "Avslått" },
];

function label(status: string) {
  return status in QUOTE_STATUS_LABEL ? QUOTE_STATUS_LABEL[status as QuoteFlowStatus] : STATUSES.find((item) => item.value === status)?.label ?? status;
}

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const query = await searchParams;
  const status = query.status || "all";
  const quotes = await listQuotes(status);
  return (
    <>
      <div className="top">
        <div>
          <h1>Tilbud</h1>
          <p className="muted">Utkast og sendte tilbud. Filteret følger statusen på tilbudet.</p>
        </div>
      </div>
      <form className="filters" method="get">
        <select name="status" defaultValue={status}>
          {STATUSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Vis
        </button>
      </form>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Tilbud</th>
              <th>Status</th>
              <th>Avtale</th>
              <th>Prosjekt</th>
              <th>Sum inkl. mva</th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 ? (
              <tr>
                <td colSpan={5}>Ingen tilbud i dette utvalget.</td>
              </tr>
            ) : null}
            {quotes.map((quote) => (
              <tr key={quote.id}>
                <td>
                  <Link href={`/tilbud/${quote.id}`}>{quote.title}</Link>
                  <div className="muted">rev. {quote.revision}</div>
                </td>
                <td>{label(quote.status)}</td>
                <td>{quote.dealId ? <Link href={`/avtaler/${quote.dealId}`}>{quote.dealTitle}</Link> : "–"}</td>
                <td>{quote.projectId ? <Link href={`/prosjekter/${quote.projectId}`}>{quote.projectTitle}</Link> : "–"}</td>
                <td>{nok(quote.totalIncVat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
