import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { loadDb, localId, saveDb } from "./db";

export async function captureMedia(input: {
  projectId?: string;
  dealId?: string;
  roomId: string;
  floorId: string;
  inspectionId: string;
  kind: "photo" | "video";
  internal: boolean;
}) {
  const permission = Platform.OS === "web" ? { granted: true } : await ImagePicker.requestCameraPermissionsAsync();
  const result =
    Platform.OS === "web" || !permission.granted
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: input.kind === "video" ? ["videos"] : ["images"], quality: 0.7 })
      : await ImagePicker.launchCameraAsync({ mediaTypes: input.kind === "video" ? ["videos"] : ["images"], quality: 0.7 });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const id = localId("media");
  const snapshot = await loadDb();
  snapshot.files.push({
    id,
    uri: asset.uri,
    name: asset.fileName || `${input.kind}-${id}`,
    mimeType: asset.mimeType || (input.kind === "video" ? "video/mp4" : "image/jpeg"),
    projectId: input.projectId ?? "",
    dealId: input.dealId ?? "",
    kind: input.kind,
    internal: input.internal,
    roomId: input.roomId,
    floorId: input.floorId,
    wallId: "",
    inspectionId: input.inspectionId,
  });
  await saveDb(snapshot);
  return id;
}
