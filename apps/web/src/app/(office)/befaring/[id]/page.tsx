import { inspectionView } from "@/server/inspections";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let inspection;
  try {
    inspection = await inspectionView(id);
  } catch {
    notFound();
  }
  return (
    <>
      <div className="top">
        <div>
          <p className="muted">{inspection.template}{inspection.version ? ` · versjon ${inspection.version}` : ""}</p>
          <h1>Befaring · {inspection.title}</h1>
          <p>Utført av {inspection.inspector}. Intern oppsummering, samme rekkefølge som skjemaet.</p>
        </div>
        <Link className="btn primary" href={`/befaring/${inspection.id}/skjema`}>Fyll ut sjekkliste</Link>
        <a className="btn" href={`/api/inspections/${inspection.id}/pdf`}>Last ned PDF</a>
      </div>
      <div className="stack">
        {inspection.sections.map((section) => (
          <section className="card stack" key={section.name}>
            <h2>{section.name}</h2>
            {section.items.map((item) => (
              <div key={item.prompt}>
                <div className="muted">{item.prompt}</div>
                <strong>{item.value}{item.unit && item.value !== "–" ? ` ${item.unit}` : ""}</strong>
                {item.freeText ? <div>{item.freeText}</div> : null}
                {item.internalNote ? <div className="badge warn">Internt: {item.internalNote}</div> : null}
                {item.images.map((image) => (
                  <div key={image.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={image.fileName ?? item.prompt} src={`/api/files/media/${image.id}`} style={{ maxWidth: 280, borderRadius: 8 }} />
                    <div className="muted">{image.fileName}</div>
                  </div>
                ))}
              </div>
            ))}
            {section.notes.map((note) => (
              <div key={note.id} className={note.internal ? "badge warn" : ""}>
                {note.internal ? "Internt notat: " : ""}
                {note.body}
              </div>
            ))}
          </section>
        ))}
        {inspection.images.length ? (
          <section className="card stack">
            <h2>Bilder</h2>
            {inspection.images.map((image) => (
              <div key={image.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={image.fileName ?? "Bilde fra befaring"} src={`/api/files/media/${image.id}`} style={{ maxWidth: 360, borderRadius: 8 }} />
                <div className="muted">{image.fileName}</div>
              </div>
            ))}
          </section>
        ) : null}
        <p className="muted">
          <Link href="/sjekklister">Rediger sjekklisten</Link>
        </p>
      </div>
    </>
  );
}
