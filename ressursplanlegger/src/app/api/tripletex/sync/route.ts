import { getCurrentUser } from "@/lib/auth";
import { runTripletexSync } from "@/lib/tripletex/run";

export async function POST(request: Request) {
  const secret = process.env.TRIPLETEX_SYNC_SECRET?.trim();
  const header = request.headers.get("authorization") ?? "";
  const bearerOk = Boolean(secret) && header === `Bearer ${secret}`;
  if (!bearerOk) {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const report = await runTripletexSync();
  if (report.disabled) return Response.json(report, { status: 503 });
  if (!report.ok) return Response.json(report, { status: 502 });
  return Response.json(report);
}
