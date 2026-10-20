import { inspectionForm } from "@/server/inspections";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InspectionForm } from "./form";

export default async function InspectionFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let form;
  try {
    form = await inspectionForm(id);
  } catch (error) {
    console.error(error);
    notFound();
  }
  return (
    <>
      <div className="top">
        <div>
          <p className="muted">
            {form.dealId ? <Link href={`/avtaler/${form.dealId}`}>{form.title}</Link> : form.title}
            {form.version ? ` · ${form.template} v${form.version}` : ` · ${form.template}`}
          </p>
          <h1>Ny befaring</h1>
          <p>Fyll ut Tilbudsbefaring her. Bilder tas i befaring-appen og synkes inn på samme befaring.</p>
        </div>
        <Link className="btn" href={`/befaring/${form.id}`}>Oppsummering</Link>
      </div>
      {form.sections.length === 0 ? <p>Ingen publisert sjekkliste. Publiser en versjon under Sjekklister.</p> : <InspectionForm form={form} />}
    </>
  );
}
