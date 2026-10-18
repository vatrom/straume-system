import { GoalList } from "@/components/InsightCharts";
import { currentUser } from "@/server/auth";
import { goalBoard, insightMeta, sellersSeePeers } from "@/server/insights";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoalForm } from "./form";

export default async function GoalsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [goals, meta, peers] = await Promise.all([goalBoard(user), insightMeta(user), sellersSeePeers()]);
  return (
    <>
      <div className="top">
        <div>
          <h1>Salgsmål</h1>
          <p className="muted">Mål for selskapet og per selger. Fremdrift regnes av vunne avtaler i perioden. Selgere ser hverandre: {peers ? "ja" : "nei"}.</p>
        </div>
        <Link className="btn" href="/innsikt">Til dashbordet</Link>
      </div>
      <GoalList goals={goals} />
      <div style={{ height: 16 }} />
      <GoalForm sellers={meta.sellers} isAdmin={user.role === "admin"} initialPeers={peers} />
    </>
  );
}
