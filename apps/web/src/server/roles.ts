import { HttpError } from "./http";

export function assertAdmin(user: { role: string }): void {
  if (user.role !== "admin") throw new HttpError(403, "Bare administrator kan gjøre dette");
}
