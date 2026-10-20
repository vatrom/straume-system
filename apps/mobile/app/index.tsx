import { API_BASE, api } from "@/src/api";
import { readToken, writeToken } from "@/src/session";
import { Button, Card, Field, colors } from "@/src/ui";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

export default function LoginScreen() {
  const router = useRouter();
  const localApi = API_BASE.includes("localhost") || API_BASE.includes("127.0.0.1");
  const [email, setEmail] = useState(localApi ? "noah.lien@straume.test" : "");
  const [password, setPassword] = useState(localApi ? "bytt-meg-lokalt" : "");
  const [error, setError] = useState("");

  useEffect(() => {
    void readToken().then((token) => {
      if (token) router.replace("/prosjekter");
    });
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 36, color: colors.sea, fontWeight: "700" }}>Straume befaring</Text>
      <Text style={{ color: colors.muted }}>Fungerer uten nett. Bilder, lyd og video lagres på salgsavtalen eller prosjektet.</Text>
      <Card>
        <Field label="E-post" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Field label="Passord" secureTextEntry value={password} onChangeText={setPassword} />
        {error ? <Text style={{ color: "#9d2c2c" }}>{error}</Text> : null}
        <Button
          label="Logg inn"
          onPress={async () => {
            try {
              const data = await api<{ token: string }>("/api/auth/login", null, {
                method: "POST",
                body: JSON.stringify({ email, password }),
              });
              await writeToken(data.token);
              router.replace("/prosjekter");
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Innlogging feilet");
            }
          }}
        />
      </Card>
    </View>
  );
}
