import { ConfirmSubmit } from "@/components/confirm-submit";
import { createUser, deleteUser } from "@/lib/auth-actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UserForm } from "@/components/user-form";

export default async function BrukerePage() {
  const admin = await requireAdmin();
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Brukere</h1>
          <p className="lede">Administrator kan opprette kontoer. Den nye brukeren får et engangspassord.</p>
        </div>
      </header>
      <UserForm action={createUser} />
      <div className="stack" style={{ marginTop: "1rem" }}>
        {users.map((user) => (
          <article key={user.id} className="card project-line">
            <span>
              <strong>{user.name}</strong>
              <div className="meta">
                {user.email} · {user.role === "admin" ? "Administrator" : "Bruker"}
              </div>
            </span>
            {user.id === admin.id ? null : (
              <form action={deleteUser.bind(null, user.id)}>
                <ConfirmSubmit label="Slett" confirm={`Slette brukeren ${user.name}?`} />
              </form>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
