export function bearerAuthorized(
  header: string,
  env: { SYNC_SECRET?: string; TRIPLETEX_SYNC_SECRET?: string; [key: string]: string | undefined },
): boolean {
  const secrets = [env.SYNC_SECRET, env.TRIPLETEX_SYNC_SECRET].map((value) => value?.trim() ?? "").filter(Boolean);
  return secrets.some((secret) => header === `Bearer ${secret}`);
}
