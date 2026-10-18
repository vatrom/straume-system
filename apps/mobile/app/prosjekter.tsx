import { loadDb, type ProjectRow } from "@/src/db";
import { readToken, writeToken } from "@/src/session";
import { syncNow } from "@/src/sync";
import { Button, Card, colors } from "@/src/ui";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

export default function ProjectsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [status, setStatus] = useState("Ikke synket");

  const reload = useCallback(async () => {
    const token = await readToken();
    if (!token) {
      router.replace("/");
      return;
    }
    const db = await loadDb();
    setProjects(db.projects);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const columns = width >= 900 ? 2 : 1;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: width >= 700 ? "row" : "column", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ fontSize: 28, color: colors.sea, fontWeight: "700" }}>Prosjekter</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button
            label="Synk"
            onPress={async () => {
              const token = await readToken();
              if (!token) return;
              setStatus("Synker …");
              try {
                setStatus(await syncNow(token));
                await reload();
              } catch (error) {
                setStatus(error instanceof Error ? `${error.message} Endringer er lagret lokalt.` : "Synk feilet. Endringer er lagret lokalt.");
              }
            }}
          />
          <Button
            label="Logg ut"
            tone="ghost"
            onPress={async () => {
              await writeToken(null);
              router.replace("/");
            }}
          />
        </View>
      </View>
      <Text style={{ color: colors.muted }}>{status}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {projects.map((project) => (
          <Pressable key={project.id} onPress={() => router.push(`/prosjekt/${project.id}`)} style={{ width: columns === 2 ? "48%" : "100%" }}>
            <Card>
              <Text style={{ fontSize: 18, fontWeight: "700" }}>{project.title}</Text>
              <Text>{project.address || "Ingen adresse"}</Text>
              <Text style={{ color: colors.muted }}>
                {project.phaseName} · {project.boardName}
              </Text>
              <Text style={{ color: colors.muted }}>
                Selger {project.sellerName} · PL {project.projectManagerName}
              </Text>
            </Card>
          </Pressable>
        ))}
      </View>
      {projects.length === 0 ? <Text>Trykk Synk for å hente prosjektene fra kontoret. Uten nett vises det som allerede ligger på enheten.</Text> : null}
    </ScrollView>
  );
}
