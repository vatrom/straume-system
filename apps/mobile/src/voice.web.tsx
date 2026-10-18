import { useState } from "react";
import { Text } from "react-native";
import { loadDb, localId, saveDb } from "./db";
import { Button } from "./ui";

export function VoiceNote({ projectId, roomId, floorId, inspectionId, internal }: { projectId: string; roomId: string; floorId: string; inspectionId: string; internal: boolean }) {
  const [message, setMessage] = useState("På nettleser velger du en lydfil. Opptak skjer i Expo Go.");
  return (
    <>
      <Button
        label="Legg ved lydfil"
        tone="ghost"
        onPress={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "audio/*";
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            const snapshot = await loadDb();
            snapshot.files.push({
              id: localId("voice"),
              uri: URL.createObjectURL(file),
              name: file.name,
              mimeType: file.type || "audio/mpeg",
              projectId,
              kind: "voice",
              internal,
              roomId,
              floorId,
              wallId: "",
              inspectionId,
            });
            await saveDb(snapshot);
            setMessage("Lydfilen ligger i utboksen.");
          };
          input.click();
        }}
      />
      <Text>{message}</Text>
    </>
  );
}
