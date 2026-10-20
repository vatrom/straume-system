/**
 * Ingen innlogging i denne versjonen. Alle som når serveren deler samme data.
 * Senere kan getCurrentUser() lese en sesjon (for eksempel Auth.js) og
 * requireUser() avvise kall uten gyldig bruker. Server actions kaller
 * requireUser() allerede, så innlogging kan legges på ett sted.
 */
export type CurrentUser = {
  id: string;
  name: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return { id: "lokal", name: "Straume" };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Ikke innlogget");
  }
  return user;
}
