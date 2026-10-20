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
  return (
    <>
      <p className="muted">
        <Link href={`/tilbud/${quote.id}`}>Tilbake til tilbudet</Link>
      </p>
      <h1>Kundens PDF</h1>
      <iframe title="Tilbud" src={`/api/quotes/${quote.id}/pdf`} style={{ width: "100%", height: "85vh", border: "1px solid #d7d7d4", background: "#fff" }} />
    </>
  );
}
