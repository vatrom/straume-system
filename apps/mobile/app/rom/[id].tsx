import { loadDb, localId, rowsOf, saveDb, touch } from "@/src/db";
import { captureMedia } from "@/src/media";
import { VoiceNote } from "@/src/voice";
import { Button, Card, Field, colors } from "@/src/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState(true);
  const [measures, setMeasures] = useState("Ingen mål ennå");
  const [context, setContext] = useState({ projectId: "", floorId: "", inspectionId: "" });
  const [saved, setSaved] = useState("");

  useEffect(() => {
    void (async () => {
      const db = await loadDb();
      const room = db.rows.find((row) => row.entity === "room" && row.id === id);
      if (!room) return;
      setName(String(room.payload.name ?? ""));
      const floor = db.rows.find((row) => row.entity === "floor" && row.id === room.payload.floorId);
      setContext({
        projectId: String(floor?.payload.projectId ?? ""),
        floorId: String(room.payload.floorId ?? ""),
        inspectionId: String(floor?.payload.inspectionId ?? ""),
      });
      setMeasures(`Omkrets ${room.payload.perimeterM ?? "–"} m · høyde ${room.payload.ceilingHeightM ?? "–"} m · gulv ${room.payload.floorAreaM ?? "–"} m²`);
    })();
  }, [id]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Field label="Romnavn" value={name} onChangeText={setName} />
      <Button
        label="Lagre navn"
        tone="ghost"
        onPress={async () => {
          let db = await loadDb();
          db = touch(db, "room", String(id), { name });
          await saveDb(db);
          setSaved("Lagret lokalt.");
        }}
      />
      <Card>
        <Text style={{ fontWeight: "700" }}>Mål til mengder</Text>
        <Text>{measures}</Text>
        <Button label="Åpne skisse" onPress={() => router.push(`/skisse/${id}`)} />
      </Card>
      <Card>
        <Text style={{ fontWeight: "700" }}>Notat på rommet</Text>
        <Field label="Tekst" value={note} onChangeText={setNote} multiline />
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Switch value={internal} onValueChange={setInternal} />
          <Text>{internal ? "Internt" : "Kan vises mot kunde"}</Text>
        </View>
        <Button
          label="Lagre notat"
          onPress={async () => {
            if (!note.trim() || !context.projectId) return;
            let db = await loadDb();
            db = touch(db, "note", localId("notat"), {
              projectId: context.projectId,
              inspectionId: context.inspectionId || null,
              floorId: context.floorId,
              roomId: id,
              body: note.trim(),
              internal,
            });
            await saveDb(db);
            setNote("");
            setSaved("Notatet er lagret lokalt.");
          }}
        />
      </Card>
      <Card>
        <Text style={{ fontWeight: "700" }}>Media på rommet</Text>
        <Text style={{ color: colors.muted }}>Filene kopieres inn i befaringen og lastes opp til prosjektlageret ved synk.</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button label="Bilde" tone="ghost" onPress={() => void captureMedia({ ...context, roomId: String(id), kind: "photo", internal })} />
          <Button label="Video" tone="ghost" onPress={() => void captureMedia({ ...context, roomId: String(id), kind: "video", internal })} />
        </View>
        <VoiceNote projectId={context.projectId} roomId={String(id)} floorId={context.floorId} inspectionId={context.inspectionId} internal={internal} />
      </Card>
      {saved ? <Text>{saved}</Text> : null}
      <Text style={{ color: colors.muted }}>Vegger nummereres med klokka fra døra i skissen.</Text>
    </ScrollView>
  );
}
