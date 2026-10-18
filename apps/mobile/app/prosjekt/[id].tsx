import { loadDb, localId, rowsOf, saveDb, touch, type SyncRow } from "@/src/db";
import { captureMedia } from "@/src/media";
import { VoiceNote } from "@/src/voice";
import { Button, Card, Field, colors } from "@/src/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Switch, Text, useWindowDimensions, View } from "react-native";

type Item = { id: string; prompt: string; questionType: string; choices: string[] | null; unit: string | null };
type Section = { name: string; tradeCode: string; items: Item[] };
type Checklist = { versionId: string; sections: Section[] };

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [title, setTitle] = useState("Prosjekt");
  const [floors, setFloors] = useState<SyncRow[]>([]);
  const [rooms, setRooms] = useState<SyncRow[]>([]);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [step, setStep] = useState(0);
  const [internal, setInternal] = useState(true);
  const [free, setFree] = useState("");
  const [inspectionId, setInspectionId] = useState("");

  const reload = useCallback(async () => {
    const db = await loadDb();
    const project = db.projects.find((item) => item.id === id);
    setTitle(project?.title ?? "Prosjekt");
    setFloors(rowsOf(db, "floor").filter((row) => row.payload.projectId === id));
    const floorIds = new Set(rowsOf(db, "floor").filter((row) => row.payload.projectId === id).map((row) => row.id));
    setRooms(rowsOf(db, "room").filter((row) => floorIds.has(String(row.payload.floorId))));
    setChecklist((db.checklist as Checklist | null) ?? null);
    const inspection = rowsOf(db, "inspection").find((row) => row.payload.projectId === id);
    setInspectionId(inspection?.id ?? "");
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function ensureInspection() {
    let db = await loadDb();
    const versionId = (db.checklist as Checklist | null)?.versionId ?? null;
    let inspection = rowsOf(db, "inspection").find((row) => row.payload.projectId === id);
    if (!inspection) {
      const created = localId("bef");
      db = touch(db, "inspection", created, { projectId: id, status: "draft", templateVersionId: versionId, visitedAt: new Date().toISOString() });
      inspection = db.rows.find((row) => row.id === created);
    }
    await saveDb(db);
    return inspection?.id ?? "";
  }

  const section = checklist?.sections[step];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "700", color: colors.sea }}>{title}</Text>
      <View style={{ flexDirection: width >= 800 ? "row" : "column", gap: 12, alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 12, width: "100%" }}>
          <Card>
            <Text style={{ fontWeight: "700" }}>Etasjer og rom</Text>
            {floors.map((floor) => (
              <View key={floor.id} style={{ gap: 6 }}>
                <Text style={{ fontSize: 18 }}>{String(floor.payload.name)}</Text>
                {rooms
                  .filter((room) => room.payload.floorId === floor.id)
                  .map((room) => (
                    <Button key={room.id} label={String(room.payload.name)} tone="ghost" onPress={() => router.push(`/rom/${room.id}`)} />
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
                      perimeterM: 11.8,
                      ceilingHeightM: 2.4,
                      floorAreaM: 8.4,
                      measurementSource: "sketch",
                      sketch: { points: [{ x: 0, y: 0 }, { x: 3.5, y: 0 }, { x: 3.5, y: 2.4 }, { x: 0, y: 2.4 }], doorEdge: 0, ceilingHeightM: 2.4 },
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
                db = touch(db, "floor", localId("etasje"), { projectId: id, inspectionId: visit, name: `${floors.length + 1}. etasje`, sortOrder: floors.length });
                await saveDb(db);
                await reload();
              }}
            />
          </Card>
        </View>
        <View style={{ flex: 1.3, gap: 12, width: "100%" }}>
          <Card>
            <Text style={{ fontWeight: "700" }}>Sjekkliste</Text>
            <Text style={{ color: colors.muted }}>Samme rekkefølge som tilbudet. Fri tekst kan alltid skrives, og merkes internt.</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {(checklist?.sections ?? []).map((item, index) => (
                <Button key={item.tradeCode} label={item.name} tone={index === step ? "solid" : "ghost"} onPress={() => setStep(index)} />
              ))}
            </View>
            {section ? (
              <View style={{ gap: 10 }}>
                {section.items.map((item) => (
                  <Question key={item.id} item={item} inspectionId={inspectionId || "mangler"} />
                ))}
                <Field label="Fri tekst på dette steget" value={free} onChangeText={setFree} multiline />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Switch value={internal} onValueChange={setInternal} />
                  <Text>{internal ? "Internt notat" : "Kan vises mot kunde"}</Text>
                </View>
                <Button
                  label="Lagre fritekst"
                  onPress={async () => {
                    if (!free.trim()) return;
                    const visit = inspectionId || (await ensureInspection());
                    let db = await loadDb();
                    db = touch(db, "note", localId("notat"), {
                      projectId: id,
                      inspectionId: visit,
                      sectionKey: section.tradeCode,
                      body: free.trim(),
                      internal,
                    });
                    await saveDb(db);
                    setFree("");
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

function Question({ item, inspectionId }: { item: Item; inspectionId: string }) {
  const [value, setValue] = useState("");
  const [extra, setExtra] = useState("");
  const [hidden, setHidden] = useState("");
  return (
    <View style={{ gap: 4 }}>
      <Text>{item.prompt}</Text>
      {item.questionType === "yes_no" ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="Ja" tone={value === "ja" ? "solid" : "ghost"} onPress={() => setValue("ja")} />
          <Button label="Nei" tone={value === "nei" ? "solid" : "ghost"} onPress={() => setValue("nei")} />
        </View>
      ) : item.questionType === "choice" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(item.choices ?? []).map((choice) => (
            <Button key={choice} label={choice} tone={value === choice ? "solid" : "ghost"} onPress={() => setValue(choice)} />
          ))}
        </View>
      ) : (
        <Field label={item.unit || "Svar"} value={value} onChangeText={setValue} keyboardType={item.questionType === "text" ? "default" : "decimal-pad"} />
      )}
      <Field label="Fri tekst" value={extra} onChangeText={setExtra} />
      <Field label="Internt notat" value={hidden} onChangeText={setHidden} />
      <Button
        label="Lagre svar"
        tone="ghost"
        onPress={async () => {
          if (!inspectionId || inspectionId === "mangler") return;
          let db = await loadDb();
          const existing = rowsOf(db, "checklist_answer").find((row) => row.payload.itemId === item.id && row.payload.inspectionId === inspectionId);
          const stored = item.questionType === "yes_no" ? value === "ja" : item.questionType === "number" || item.questionType === "measurement" ? Number(value) : value;
          db = touch(db, "checklist_answer", existing?.id ?? localId("svar"), {
            inspectionId,
            itemId: item.id,
            value: stored,
            freeText: extra || null,
            internalNote: hidden || null,
          });
          await saveDb(db);
        }}
      />
    </View>
  );
}
