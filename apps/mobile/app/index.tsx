import { api } from "@/src/api";
import { readToken, writeToken } from "@/src/session";
import { Button, Card, Field, colors } from "@/src/ui";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("noah.lien@straume.test");
  const [password, setPassword] = useState("bytt-meg-lokalt");
  const [error, setError] = useState("");

  useEffect(() => {
    void readToken().then((token) => {
      if (token) router.replace("/prosjekter");
    });
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 36, color: colors.sea, fontWeight: "700" }}>Straume befaring</Text>
      <Text style={{ color: colors.muted }}>Fungerer uten nett. Bilder, lyd og video går til prosjektet, ikke til kamerarullen.</Text>
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
