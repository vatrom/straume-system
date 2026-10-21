import { getCurrentUser } from "@/lib/auth";
import { runTripletexSync } from "@/lib/tripletex/run";
import { bearerAuthorized } from "@/lib/tripletex/secret";

export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const bearerOk = bearerAuthorized(header, process.env);
  if (!bearerOk) {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const report = await runTripletexSync();
  if (report.disabled) return Response.json(report, { status: 503 });
  if (!report.ok) return Response.json(report, { status: 502 });
  return Response.json(report);
}
