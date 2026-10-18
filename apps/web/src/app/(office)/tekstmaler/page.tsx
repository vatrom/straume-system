import { listTemplates } from "@/server/quotes";
import { currentUser } from "@/server/auth";
import { redirect } from "next/navigation";
import { TemplateEditor } from "./editor";

export default async function TemplatesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const templates = await listTemplates();
  return (
    <>
      <div className="top">
        <div>
          <h1>Tekstmaler</h1>
          <p className="muted">Flettefelt henter satser fra prislisten. En sats som ikke er avklart, vises som «sats ikke satt».</p>
        </div>
      </div>
      <TemplateEditor isAdmin={user.role === "admin"} templates={templates.map((template) => ({ key: template.key, name: template.name, kind: template.kind, body: template.body }))} />
    </>
  );
}
