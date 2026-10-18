import { currentUser } from "@/server/auth";
import { checklistEditor } from "@/server/checklists";
import { ChecklistEditor } from "./editor";

export default async function ChecklistsPage() {
  const user = await currentUser();
  const data = await checklistEditor();
  const sections = data.draft.sections.map((section) => ({
    tradeCode: section.tradeCode,
    name: section.name,
    items: section.items.map((item) => ({
      prompt: item.prompt,
      questionType: item.questionType,
      required: item.required,
      choices: Array.isArray(item.choices) ? (item.choices as string[]).join(" | ") : "",
      unit: item.unit ?? "",
    })),
  }));
  return (
    <>
      <div className="top">
        <div>
          <h1>Sjekklister</h1>
          <p className="muted">Rekkefølgen følger tilbudet: riving, tømrer, elektriker, rørlegger, murer/flis og maler.</p>
        </div>
      </div>
      <ChecklistEditor initial={sections} publishedVersion={data.published?.version ?? null} canEdit={user?.role === "admin"} />
    </>
  );
}
