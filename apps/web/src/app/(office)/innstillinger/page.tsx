import { currentUser } from "@/server/auth";
import { listOptions } from "@/server/crm";
import { prisma } from "@straume/db";
import { redirect } from "next/navigation";
import { SettingsForms } from "./forms";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const winner = await prisma.appSetting.findUnique({ where: { key: "winner_email" } });
  const users = user.role === "admin" ? await prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true, active: true } }) : [];
  const options = user.role === "admin" ? await listOptions() : [];
  return (
    <>
      <div className="top">
        <div>
          <h1>Innstillinger</h1>
          <p className="muted">Winner-mottaker, brukere og valglister. E-post logges lokalt og sendes ikke ut.</p>
        </div>
      </div>
      <SettingsForms winnerEmail={winner?.value ?? ""} isAdmin={user.role === "admin"} users={users} lists={options.map((list) => ({ key: list.key, name: list.name, items: list.items.map((item) => ({ id: item.id, label: item.label, active: item.active })) }))} />
    </>
  );
}
