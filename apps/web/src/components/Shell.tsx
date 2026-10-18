"use client";

import type { SessionUser } from "@/server/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links: [string, string][] = [
  ["/pipeline", "Salgsavtaler"],
  ["/avtaler/liste", "Avtaleliste"],
  ["/innsikt", "Innsikt"],
  ["/prosjekter/tavle", "Prosjekttavle"],
  ["/prosjekter", "Prosjektliste"],
  ["/personer", "Personer"],
  ["/organisasjoner", "Organisasjoner"],
  ["/prislister", "Prislister"],
  ["/sjekklister", "Sjekklister"],
  ["/innstillinger", "Innstillinger"],
];

export function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="mark">SV</div>
          <div>
            <strong>Straume</strong>
            <small>Våtrom · kontor</small>
          </div>
        </div>
        <nav className="nav">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={navActive(path, href) ? "active" : ""}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="who">
          <div>{user.name}</div>
          <div>{roleName(user.role)}</div>
          <button
            className="btn ghost"
            style={{ color: "white", marginTop: 8 }}
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
              router.refresh();
            }}
          >
            Logg ut
          </button>
        </div>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}

function navActive(path: string, href: string) {
  if (href === "/pipeline") return path === "/pipeline" || (path.startsWith("/avtaler/") && !path.startsWith("/avtaler/liste") && path !== "/avtaler/ny");
  if (href === "/avtaler/liste") return path.startsWith("/avtaler/liste") || path.startsWith("/avtaler/ny");
  if (href === "/prosjekter") return path === href || (path.startsWith("/prosjekter/") && !path.startsWith("/prosjekter/tavle"));
  return path === href || path.startsWith(`${href}/`);
}

function roleName(role: string) {
  return { admin: "Administrator", selger: "Selger", prosjektleder: "Prosjektleder", kontor: "Kontor" }[role] ?? role;
}
