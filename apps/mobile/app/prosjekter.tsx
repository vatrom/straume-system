import { loadDb, type DealRow, type ProjectRow } from "@/src/db";
import { readToken, writeToken } from "@/src/session";
import { syncNow } from "@/src/sync";
import { Button, Card, Field, colors } from "@/src/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

export default function ProjectsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Ikke synket");

  const reload = useCallback(async () => {
    const token = await readToken();
    if (!token) {
      router.replace("/");
      return;
    }
    const db = await loadDb();
    setProjects(db.projects.filter((project) => project.status === "open" || !project.status));
    setDeals(db.deals.filter((deal) => deal.status === "open" || !deal.status));
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const needle = query.trim().toLowerCase();
  const visibleDeals = deals.filter((deal) => matches(needle, deal.title, deal.address, deal.customerName, deal.stageName));
  const visibleProjects = projects.filter((project) => matches(needle, project.title, project.address, project.phaseName));
  const columns = width >= 900 ? 2 : 1;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: "Befaring" }} />
      <View style={{ flexDirection: width >= 700 ? "row" : "column", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ fontSize: 28, color: colors.sea, fontWeight: "700" }}>Befaring</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button label="Ny avtale" onPress={() => router.push("/avtale/ny")} />
          <Button
            label="Synk"
            tone="ghost"
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
      <Field label="Søk" value={query} onChangeText={setQuery} placeholder="Navn, adresse eller fase" />
      <Text style={{ fontSize: 22, color: colors.sea, fontWeight: "700" }}>Salgsavtaler</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {visibleDeals.map((deal) => (
          <Pressable key={deal.id} onPress={() => router.push(`/prosjekt/${deal.id}`)} style={{ width: columns === 2 ? "48%" : "100%" }}>
            <Card>
              <Text style={{ fontSize: 18, fontWeight: "700" }}>{deal.title}</Text>
              <Text>{deal.customerName || "Uten kundenavn"}</Text>
              <Text>{deal.address || "Ingen adresse"}</Text>
              <Text style={{ color: colors.muted }}>
                {deal.stageName} · {deal.pipelineName}
              </Text>
            </Card>
          </Pressable>
        ))}
      </View>
      {visibleDeals.length === 0 ? <Text>Ingen åpne salgsavtaler{needle ? " som treffer søket" : ""}. Trykk Synk, eller opprett en ny avtale.</Text> : null}
      <Text style={{ fontSize: 22, color: colors.sea, fontWeight: "700" }}>Prosjekter</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {visibleProjects.map((project) => (
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
      {visibleProjects.length === 0 ? <Text>Ingen aktive prosjekter{needle ? " som treffer søket" : ""}. Uten nett vises det som allerede ligger på enheten.</Text> : null}
    </ScrollView>
  );
}

function matches(needle: string, ...parts: string[]) {
  if (!needle) return true;
  return parts.join(" ").toLowerCase().includes(needle);
}
