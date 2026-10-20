import { loadDb, localId, saveDb, touch, type DealRow } from "@/src/db";
import { Button, Card, Field, colors } from "@/src/ui";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text } from "react-native";

export default function NewDealScreen() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState("");

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: "Ny avtale" }} />
      <Text style={{ fontSize: 28, fontWeight: "700", color: colors.sea }}>Ny salgsavtale</Text>
      <Text style={{ color: colors.muted }}>Avtalen lagres på enheten først og sendes til kontoret ved neste synk.</Text>
      <Card>
        <Field label="Kundenavn" value={customerName} onChangeText={setCustomerName} placeholder="Fornavn og etternavn" />
        <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="E-post" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Adresse" value={street} onChangeText={setStreet} placeholder="Gate og nummer" />
        <Field label="Postnummer" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" />
        <Field label="Poststed" value={city} onChangeText={setCity} />
        {error ? <Text style={{ color: "#9d2c2c" }}>{error}</Text> : null}
        <Button
          label="Opprett avtale"
          large
          onPress={async () => {
            const name = customerName.trim();
            if (!name) {
              setError("Kunden må ha et navn.");
              return;
            }
            const id = localId("deal");
            const title = street.trim() || name;
            const deal: DealRow = {
              id,
              title,
              status: "open",
              stageName: "Innkommende henvendelse",
              pipelineName: "Salgspipe",
              address: [street.trim(), postalCode.trim(), city.trim()].filter(Boolean).join(" "),
              customerName: name,
              phone: phone.trim(),
              email: email.trim(),
              ownerName: "",
            };
            let db = await loadDb();
            db = touch(db, "deal", id, {
              customerName: name,
              phone: phone.trim(),
              email: email.trim(),
              street: street.trim(),
              postalCode: postalCode.trim(),
              city: city.trim(),
              title,
            });
            db.deals = [deal, ...db.deals.filter((item) => item.id !== id)];
            await saveDb(db);
            router.replace(`/prosjekt/${id}`);
          }}
        />
      </Card>
    </ScrollView>
  );
}
