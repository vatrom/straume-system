import { loadDb, localId, rowsOf, saveDb, touch } from "@/src/db";
import { Button, Card, Field, colors } from "@/src/ui";
import { ensureClockwise, numberedWalls, roomMeasures, sectionToSvg, withWallLength, type Point, type Sketch } from "@straume/domain";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Svg, { Polygon, Polyline, Text as SvgText } from "react-native-svg";

const EMPTY: Sketch = {
  points: [
    { x: 0, y: 0 },
    { x: 3.5, y: 0 },
    { x: 3.5, y: 2.4 },
    { x: 0, y: 2.4 },
  ],
  doorEdge: 0,
  ceilingHeightM: 2.4,
};

export default function SketchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [sketch, setSketch] = useState<Sketch>(EMPTY);
  const [lengths, setLengths] = useState<string[]>([]);
  const [height, setHeight] = useState("2.4");
  const [knee, setKnee] = useState("");
  const [ridge, setRidge] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const db = await loadDb();
      const room = db.rows.find((row) => row.entity === "room" && row.id === id);
      const stored = room?.payload.sketch as Sketch | undefined;
      const next = stored?.points?.length ? stored : EMPTY;
      setSketch(next);
      setHeight(String(next.ceilingHeightM ?? 2.4));
      setKnee(next.slope ? String(next.slope.kneeHeightM) : "");
      setRidge(next.slope ? String(next.slope.ridgeHeightM) : "");
      setLengths(numberedWalls(next).map((wall) => wall.lengthM.toFixed(2)));
    })();
  }, [id]);

  const walls = numberedWalls(sketch);
  const measures = safeMeasures(sketch);
  const laid = layout(sketch.points);

  function applyLength(index: number, raw: string) {
    const nextLengths = lengths.slice();
    nextLengths[index] = raw;
    setLengths(nextLengths);
    const value = Number(raw.replace(",", "."));
    if (!(value > 0)) return;
    try {
      const next = withWallLength({ ...sketch, ceilingHeightM: Number(height) || sketch.ceilingHeightM }, index + 1, value);
      setSketch(next);
      setLengths(numberedWalls(next).map((wall) => wall.lengthM.toFixed(2)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke endre veggen");
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.sea }}>Romskisse</Text>
      <Card>
        <Svg width="100%" height={280} viewBox="0 0 640 420">
          <Polygon points={laid.map((point) => `${point.x},${point.y}`).join(" ")} fill="#fffdf8" stroke="#123e3b" strokeWidth={3} />
          {walls.map((wall) => {
            const a = laid[wall.edgeIndex];
            const b = laid[(wall.edgeIndex + 1) % laid.length];
            if (!a || !b) return null;
            return (
              <SvgText key={wall.number} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} fontSize={16} textAnchor="middle" fill="#1d1915">
                {`V${wall.number}${wall.number === 1 ? " dør" : ""}`}
              </SvgText>
            );
          })}
        </Svg>
        <Text>
          Omkrets {measures.perimeterM.toFixed(2)} m · gulvareal {measures.floorAreaM.toFixed(2)} m² · romhøyde {measures.ceilingHeightM.toFixed(2)} m
        </Text>
      </Card>
      <Card>
        {walls.map((wall, index) => (
          <Field key={wall.number} label={`Vegg ${wall.number} (m)`} value={lengths[index] ?? ""} onChangeText={(value) => applyLength(index, value)} />
        ))}
        <Field label="Romhøyde (m)" value={height} onChangeText={setHeight} />
        <Field label="Knelhøyde ved skråtak" value={knee} onChangeText={setKnee} />
        <Field label="Mønehøyde" value={ridge} onChangeText={setRidge} />
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button
            label="Nytt hjørne"
            tone="ghost"
            onPress={() => {
              const points = sketch.points;
              const last = points[points.length - 1] ?? { x: 0, y: 0 };
              const first = points[0] ?? { x: 0, y: 0 };
              const added = ensureClockwise([...points, { x: (last.x + first.x) / 2 + 0.45, y: (last.y + first.y) / 2 + 0.45 }], sketch.doorEdge);
              const next = { ...sketch, points: added.points, doorEdge: added.doorEdge };
              setSketch(next);
              setLengths(numberedWalls(next).map((wall) => wall.lengthM.toFixed(2)));
            }}
          />
          <Button
            label="Dør til neste vegg"
            tone="ghost"
            onPress={() => {
              const next = { ...sketch, doorEdge: (sketch.doorEdge + 1) % sketch.points.length };
              setSketch(next);
              setLengths(numberedWalls(next).map((wall) => wall.lengthM.toFixed(2)));
            }}
          />
        </View>
        {knee && ridge ? <SectionView widthM={Math.max(...sketch.points.map((point) => point.x)) - Math.min(...sketch.points.map((point) => point.x))} knee={Number(knee)} ridge={Number(ridge)} /> : null}
        <Button
          label="Lagre skisse"
          onPress={async () => {
            try {
              const ceiling = Number(height.replace(",", "."));
              const slope = knee && ridge ? { kneeHeightM: Number(knee.replace(",", ".")), ridgeHeightM: Number(ridge.replace(",", ".")) } : null;
              const next = { ...sketch, ceilingHeightM: ceiling, slope };
              const measured = roomMeasures(next);
              let db = await loadDb();
              db = touch(db, "room", String(id), {
                sketch: next,
                perimeterM: measured.perimeterM,
                ceilingHeightM: measured.ceilingHeightM,
                floorAreaM: measured.floorAreaM,
                measurementSource: "sketch",
              });
              const existing = rowsOf(db, "wall").filter((row) => row.payload.roomId === id);
              for (const wall of numberedWalls(next)) {
                const found = existing.find((row) => row.payload.number === wall.number);
                db = touch(db, "wall", found?.id ?? localId("vegg"), { roomId: id, number: wall.number, edgeIndex: wall.edgeIndex, lengthM: Number(wall.lengthM.toFixed(3)) });
              }
              await saveDb(db);
              setSketch(next);
              setMessage("Skissen er lagret på enheten. PDF og PNG lages i kontoret, og kan sendes til tegner derfra.");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Kunne ikke lagre");
            }
          }}
        />
        {message ? <Text>{message}</Text> : null}
      </Card>
    </ScrollView>
  );
}

function safeMeasures(sketch: Sketch) {
  try {
    return roomMeasures(sketch);
  } catch {
    return { perimeterM: 0, floorAreaM: 0, ceilingHeightM: sketch.ceilingHeightM || 0 };
  }
}

function layout(points: Point[]): Point[] {
  if (points.length === 0) return [];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(540 / Math.max(maxX - minX, 0.01), 300 / Math.max(maxY - minY, 0.01));
  return points.map((point) => ({ x: 50 + (point.x - minX) * scale, y: 50 + (point.y - minY) * scale }));
}

function SectionView({ widthM, knee, ridge }: { widthM: number; knee: number; ridge: number }) {
  if (!(knee > 0) || !(ridge >= knee) || !(widthM > 0)) return <Text>Skråtaket trenger møne som er minst like høyt som knærne.</Text>;
  const preview = sectionToSvg({ widthM, kneeHeightM: knee, ridgeHeightM: ridge });
  const match = preview.match(/points="([^"]+)"/);
  return (
    <View>
      <Text>Snitt · skråtak</Text>
      <Svg width="100%" height={160} viewBox="0 0 640 280">
        <Polyline points={match?.[1] ?? ""} fill="#fffdf8" stroke="#123e3b" strokeWidth={3} />
      </Svg>
    </View>
  );
}
