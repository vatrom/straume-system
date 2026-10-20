import { listTemplates } from "@/server/quotes";
import { textBlockEditor } from "@/server/text-blocks";
import { currentUser } from "@/server/auth";
import { redirect } from "next/navigation";
import { BlockEditor } from "./blocks";
import { TemplateEditor } from "./editor";

export default async function TemplatesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [templates, library] = await Promise.all([listTemplates(), textBlockEditor()]);
  return (
    <>
      <div className="top">
        <div>
          <h1>Tekstmaler</h1>
          <p className="muted">Tekstblokkene er tilbudsmalens setninger, ordrett. Flettefelt henter satser, flisgodtgjørelse og summer fra kalkylen. En sats som ikke er avklart, vises som «sats ikke satt».</p>
        </div>
      </div>
      <BlockEditor isAdmin={user.role === "admin"} publishedVersion={library.publishedVersion} draftVersion={library.draftVersion} sections={library.sections} />
      <h2 style={{ marginTop: 28 }}>E-post og tilleggsarbeid</h2>
      <TemplateEditor isAdmin={user.role === "admin"} templates={templates.map((template) => ({ key: template.key, name: template.name, kind: template.kind, body: template.body }))} />
    </>
  );
}
