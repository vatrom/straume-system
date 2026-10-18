import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useState } from "react";
import { Text } from "react-native";
import { loadDb, localId, saveDb } from "./db";
import { Button } from "./ui";

export function VoiceNote({ projectId, roomId, floorId, inspectionId, internal }: { projectId: string; roomId: string; floorId: string; inspectionId: string; internal: boolean }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [on, setOn] = useState(false);
  const [message, setMessage] = useState("");

  async function toggle() {
    if (!on) {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setMessage("Mikrofonen er ikke tilgjengelig.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setOn(true);
      return;
    }
    await recorder.stop();
    setOn(false);
    const uri = recorder.uri;
    if (!uri) return;
    const snapshot = await loadDb();
    snapshot.files.push({
      id: localId("voice"),
      uri,
      name: "stemme.m4a",
      mimeType: "audio/mp4",
      projectId,
      kind: "voice",
      internal,
      roomId,
      floorId,
      wallId: "",
      inspectionId,
    });
    await saveDb(snapshot);
    setMessage("Stemmenotat ligger i utboksen og lastes opp ved synk.");
  }

  return (
    <>
      <Button label={on ? "Stopp opptak" : "Ta opp stemme"} onPress={() => void toggle()} tone="ghost" />
      {message ? <Text>{message}</Text> : null}
    </>
  );
}
