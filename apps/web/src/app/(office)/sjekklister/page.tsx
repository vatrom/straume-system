import { currentUser } from "@/server/auth";
import { checklistEditor } from "@/server/checklists";
import { asItemConfig, type ChecklistQuestionType } from "@straume/domain";
import { ChecklistEditor, type EditorSection } from "./editor";

export default async function ChecklistsPage() {
  const user = await currentUser();
  const data = await checklistEditor();
  const sections: EditorSection[] = data.draft.sections.map((section) => ({
    tradeCode: section.tradeCode,
    name: section.name,
    items: section.items.map((item) => {
      const config = asItemConfig(item.config);
      return {
        prompt: item.prompt,
        questionType: item.questionType as ChecklistQuestionType,
        required: item.required,
        choices: Array.isArray(item.choices) ? (item.choices as string[]).join(" | ") : "",
        unit: item.unit ?? "",
        helpText: item.helpText ?? "",
        itemKey: item.itemKey ?? "",
        role: config?.role ?? "info",
        showKey: config?.showWhen?.itemKey ?? "",
        showValues: config?.showWhen?.anyOf.join(" | ") ?? "",
        ignoreValues: config?.ignoreValues?.join(" | ") ?? "",
        gateChoices: config?.gateChoices?.join(" | ") ?? "",
        controlsSections: Boolean(config?.controlsSections),
        prefill: config?.prefill ?? "",
        tradeByChoice: pairs(config?.tradeByChoice),
        channelByChoice: pairs(config?.channelByChoice),
        mappings: (config?.mappings ?? []).map((mapping) => ({
          when: mapping.when ?? "",
          code: mapping.code,
          formula: mapping.formula,
          once: mapping.once === true,
        })),
      };
    }),
  }));
  return (
    <>
      <div className="top">
        <div>
          <h1>{data.template.name}</h1>
          <p className="muted">Felt, valg, enheter, rekkefølge, betingelser og varekodemapping kan endres her. Fritekst ligger på hver seksjon.</p>
        </div>
      </div>
      <ChecklistEditor initial={sections} publishedVersion={data.published?.version ?? null} canEdit={user?.role === "admin"} />
    </>
  );
}

function pairs(record: Record<string, string> | undefined): string {
  if (!record) return "";
  return Object.entries(record).map(([key, value]) => `${key}=${value}`).join("\n");
}
