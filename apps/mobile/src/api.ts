import { Platform } from "react-native";

export const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export async function api<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? "Forespørselen feilet");
  return data as T;
}

export async function uploadMedia(token: string, file: { uri: string; name: string; mimeType: string }, fields: Record<string, string>) {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await fetch(file.uri).then((response) => response.blob());
    form.append("file", blob, file.name);
  } else {
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  }
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return api("/api/media", token, { method: "POST", body: form });
}
