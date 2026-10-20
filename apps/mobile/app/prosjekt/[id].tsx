import { asItemConfig, fieldVisible, sectionVisible, selectedTrades, type ItemConfig } from "@straume/domain";
import { loadDb, localId, parentOf, parentPayload, rowsOf, saveDb, touch, type SyncRow } from "@/src/db";
import { captureMedia } from "@/src/media";
import { Button, Card, Field, colors } from "@/src/ui";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";

type Item = {
  id: string;
  prompt: string;
  questionType: string;
  choices: string[] | null;
  unit: string | null;
  helpText?: string | null;
  itemKey?: string | null;
  config?: ItemConfig | null;
};
type Section = { name: string; tradeCode: string; items: Item[] };
type Checklist = { versionId: string; name?: string; sections: Section[] };
type Stored = { value: unknown };

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [title, setTitle] = useState("Befaring");
  const [kind, setKind] = useState<"project" | "deal">("project");
  const [visitReady, setVisitReady] = useState("");
  const [floors, setFloors] = useState<SyncRow[]>([]);
  const [rooms, setRooms] = useState<SyncRow[]>([]);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [step, setStep] = useState(0);
  const [inspectionId, setInspectionId] = useState("");
  const [answers, setAnswers] = useState<Record<string, Stored>>({});
  const [internal, setInternal] = useState("");

  const reload = useCallback(async () => {
    const db = await loadDb();
    const parent = parentOf(db, String(id));
    setKind(parent?.kind ?? "project");
    setTitle(parent?.title ?? "Befaring");
    const floorRows = rowsOf(db, "floor").filter((row) => row.payload.projectId === id || row.payload.dealId === id);
    setFloors(floorRows);
    const floorIds = new Set(floorRows.map((row) => row.id));
    setRooms(rowsOf(db, "room").filter((row) => floorIds.has(String(row.payload.floorId))));
    const published = (db.checklist as Checklist | null) ?? null;
    if (published) {
      published.sections = published.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({ ...item, config: asItemConfig(item.config) })),
      }));
    }
    setChecklist(published);
    const inspection = rowsOf(db, "inspection").find((row) => row.payload.projectId === id || row.payload.dealId === id);
    const visit = inspection?.id ?? "";
    setInspectionId(visit);
    const stored: Record<string, Stored> = {};
    for (const row of rowsOf(db, "checklist_answer")) {
      if (row.payload.inspectionId !== visit) continue;
      stored[String(row.payload.itemId)] = { value: row.payload.value };
    }
    setAnswers(stored);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function ensureInspection() {
    let db = await loadDb();
    const versionId = (db.checklist as Checklist | null)?.versionId ?? null;
    const parent = parentOf(db, String(id));
    const link = parentPayload(parent?.kind ?? kind, String(id));
    let inspection = rowsOf(db, "inspection").find((row) => row.payload.projectId === id || row.payload.dealId === id);
    if (!inspection) {
      const created = localId("bef");
      db = touch(db, "inspection", created, { ...link, status: "draft", templateVersionId: versionId, visitedAt: new Date().toISOString() });
      inspection = db.rows.find((row) => row.id === created);
    }
    await saveDb(db);
    setInspectionId(inspection?.id ?? "");
    setVisitReady(inspection ? "Tilbudsbefaring er klar. Fyll ut sjekklisten under." : "");
    return inspection?.id ?? "";
  }

  const room = rooms[0]?.payload;
  const valueMap = useMemo(() => {
    const map = new Map<string, unknown>();
    for (const section of checklist?.sections ?? []) {
      for (const item of section.items) {
        if (!item.itemKey) continue;
        const stored = answers[item.id]?.value;
        map.set(item.itemKey, stored ?? prefill(item, room));
      }
    }
    return map;
  }, [answers, checklist, room]);

  const selected = selectedTrades(
    (checklist?.sections ?? []).flatMap((section) =>
      section.items.map((item) => ({
        key: item.itemKey,
        prompt: item.prompt,
        tradeCode: section.tradeCode,
        questionType: item.questionType,
        value: valueMap.get(item.itemKey ?? "") ?? null,
        config: item.config,
      })),
    ),
  );
  const visible = (checklist?.sections ?? []).filter((section) => sectionVisible(section.tradeCode, selected));
  const safeStep = Math.min(step, Math.max(visible.length - 1, 0));
  const section = visible[safeStep];
  const visibleItems = visible.flatMap((row) => row.items.filter((item) => fieldVisible(item, valueMap)));
  const answered = visibleItems.filter((item) => answers[item.id] != null && answers[item.id]?.value !== "" && answers[item.id]?.value != null).length;

  async function saveAnswer(item: Item, value: unknown) {
    const visit = inspectionId || (await ensureInspection());
    let db = await loadDb();
    const existing = rowsOf(db, "checklist_answer").find((row) => row.payload.itemId === item.id && row.payload.inspectionId === visit);
    db = touch(db, "checklist_answer", existing?.id ?? localId("svar"), {
      inspectionId: visit,
      itemId: item.id,
      value,
      freeText: null,
      internalNote: null,
    });
    await saveDb(db);
    setAnswers((current) => ({ ...current, [item.id]: { value } }));
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title }} />
      <Text style={{ fontSize: 28, fontWeight: "700", color: colors.sea }}>{title}</Text>
      <Text style={{ color: colors.muted }}>{kind === "deal" ? "Salgsavtale" : "Prosjekt"}</Text>
      <Button label="Ny befaring" large onPress={() => void ensureInspection()} />
      {visitReady ? <Text>{visitReady}</Text> : null}
      <View style={{ flexDirection: width >= 800 ? "row" : "column", gap: 12, alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 12, width: "100%" }}>
          <Card>
            <Text style={{ fontWeight: "700" }}>Etasjer og rom</Text>
            {floors.map((floor) => (
              <View key={floor.id} style={{ gap: 6 }}>
                <Text style={{ fontSize: 18 }}>{String(floor.payload.name)}</Text>
                {rooms
                  .filter((entry) => entry.payload.floorId === floor.id)
                  .map((entry) => (
                    <Button key={entry.id} label={String(entry.payload.name)} tone="ghost" onPress={() => router.push(`/rom/${entry.id}`)} />
                  ))}
                <Button
                  label="Nytt rom"
                  tone="ghost"
                  onPress={async () => {
                    const visit = await ensureInspection();
                    let db = await loadDb();
                    const roomId = localId("rom");
                    db = touch(db, "room", roomId, {
                      floorId: floor.id,
                      name: "Nytt rom",
                      sortOrder: rooms.length,
                      perimeterM: 11,
                      ceilingHeightM: 2.4,
                      floorAreaM: 5.5,
                      measurementSource: "sketch",
                      sketch: { points: [{ x: 0, y: 0 }, { x: 2.4, y: 0 }, { x: 2.4, y: 1.85 }, { x: 0, y: 1.85 }], doorEdge: 0, ceilingHeightM: 2.4 },
                    });
                    await saveDb(db);
                    setInspectionId(visit);
                    router.push(`/rom/${roomId}`);
                  }}
                />
              </View>
            ))}
            <Button
              label="Ny etasje"
              onPress={async () => {
                const visit = await ensureInspection();
                let db = await loadDb();
                db = touch(db, "floor", localId("etasje"), { ...parentPayload(kind, String(id)), inspectionId: visit, name: `${floors.length + 1}. etasje`, sortOrder: floors.length });
                await saveDb(db);
                await reload();
              }}
            />
          </Card>
        </View>
        <View style={{ flex: 1.4, gap: 12, width: "100%" }}>
          <Card>
            <Text style={{ fontWeight: "700" }}>{checklist?.name ?? "Tilbudsbefaring"}</Text>
            <Text style={{ color: colors.muted }}>{answered} av {visibleItems.length} felt · steg {visible.length ? safeStep + 1 : 0} av {visible.length}</Text>
            <View style={{ height: 8, backgroundColor: colors.line, borderRadius: 99 }}>
              <View style={{ height: 8, borderRadius: 99, backgroundColor: colors.sea, width: `${visibleItems.length ? Math.round((answered / visibleItems.length) * 100) : 0}%` }} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {visible.map((item, index) => (
                <Button key={`${item.name}-${index}`} label={item.name} large tone={index === safeStep ? "solid" : "ghost"} onPress={() => setStep(index)} />
              ))}
            </View>
            {section ? (
              <View style={{ gap: 14 }}>
                {section.items.filter((item) => fieldVisible(item, valueMap)).map((item) => (
                  <Question
                    key={item.id}
                    item={item}
                    value={answers[item.id]?.value ?? prefill(item, room)}
                    onChange={(value) => void saveAnswer(item, value)}
                    onPhoto={async () => {
                      const visit = inspectionId || (await ensureInspection());
                      const floor = floors[0];
                      const target = rooms[0];
                      if (!floor || !target) return;
                      const mediaId = await captureMedia({ ...parentPayload(kind, String(id)), roomId: target.id, floorId: floor.id, inspectionId: visit, kind: "photo", internal: true });
                      if (mediaId) await saveAnswer(item, mediaId);
                    }}
                  />
                ))}
                <Field label="Internt notat for seksjonen" value={internal} onChangeText={setInternal} multiline placeholder="Kommer aldri med i tilbudet til kunden" />
                <Button
                  label="Lagre internt notat"
                  large
                  onPress={async () => {
                    if (!internal.trim()) return;
                    const visit = inspectionId || (await ensureInspection());
                    let db = await loadDb();
                    db = touch(db, "note", localId("notat"), {
                      ...parentPayload(kind, String(id)),
                      inspectionId: visit,
                      sectionKey: section.name,
                      body: internal.trim(),
                      internal: true,
                    });
                    await saveDb(db);
                    setInternal("");
                  }}
                />
              </View>
            ) : (
              <Text>Synk for å hente sjekklisten.</Text>
            )}
          </Card>
        </View>
      </View>
    </ScrollView>
  );
}

function prefill(item: Item, room: Record<string, unknown> | undefined): unknown {
  if (!room || !item.config?.prefill) return item.questionType === "multi" ? [] : "";
  if (item.config.prefill === "gulvareal") return Number(room.floorAreaM ?? 0) || "";
  if (item.config.prefill === "takhoyde") return Number(room.ceilingHeightM ?? 0) || "";
  if (item.config.prefill === "omkrets") return Number(room.perimeterM ?? 0) || "";
  return "";
}

function Question({ item, value, onChange, onPhoto }: { item: Item; value: unknown; onChange: (value: unknown) => void; onPhoto: () => void }) {
  const selected = Array.isArray(value) ? value.map(String) : [];
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>{item.prompt}</Text>
      {item.helpText ? <Text style={{ color: colors.muted }}>{item.helpText}</Text> : null}
      {item.questionType === "yes_no" ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="Ja" large tone={value === true ? "solid" : "ghost"} onPress={() => onChange(true)} />
          <Button label="Nei" large tone={value === false ? "solid" : "ghost"} onPress={() => onChange(false)} />
        </View>
      ) : item.questionType === "choice" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(item.choices ?? []).map((choice) => (
            <Button key={choice} label={choice} large tone={value === choice ? "solid" : "ghost"} onPress={() => onChange(choice)} />
          ))}
        </View>
      ) : item.questionType === "multi" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(item.choices ?? []).map((choice) => {
            const on = selected.includes(choice);
            return (
              <Button
                key={choice}
                label={choice}
                large
                tone={on ? "solid" : "ghost"}
                onPress={() => onChange(on ? selected.filter((entry) => entry !== choice) : [...selected, choice])}
              />
            );
          })}
        </View>
      ) : item.questionType === "number" ? (
        <Stepper value={Number(value) || 0} unit={item.unit} onChange={(next) => onChange(next)} />
      ) : item.questionType === "media" ? (
        <Button label={value ? "Bilde lagret" : "Legg til bilde"} large tone={value ? "solid" : "ghost"} onPress={onPhoto} />
      ) : (
        <Field
          label={item.unit || (item.questionType === "date" ? "Dato eller fritekst" : "Svar")}
          value={value == null ? "" : String(value)}
          onChangeText={(text) => onChange(item.questionType === "measurement" ? Number(text.replace(",", ".")) : text)}
          keyboardType={item.questionType === "measurement" ? "decimal-pad" : "default"}
          multiline={item.questionType === "text"}
          placeholder={item.questionType === "date" ? "For eksempel etter nyttår" : undefined}
        />
      )}
    </View>
  );
}

function Stepper({ value, unit, onChange }: { value: number; unit: string | null; onChange: (value: number) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Button label="−" large tone="ghost" onPress={() => onChange(Math.max(0, value - 1))} />
      <Text style={{ fontSize: 28, fontWeight: "700", minWidth: 64, textAlign: "center" }}>{value}</Text>
      <Button label="+" large onPress={() => onChange(value + 1)} />
      {unit ? <Text style={{ color: colors.muted, fontSize: 16 }}>{unit}</Text> : null}
    </View>
  );
}
