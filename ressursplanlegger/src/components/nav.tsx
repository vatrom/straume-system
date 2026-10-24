"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth-actions";

const LINKS = [
  { href: "/", label: "Oversikt" },
  { href: "/kapasitet", label: "Kapasitet" },
  { href: "/prosjekter", label: "Prosjekter" },
  { href: "/ressurser", label: "Ressurser" },
  { href: "/tripletex", label: "Timer" },
];

export function Nav({ user }: { user: { name: string; role: string } | null }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Hovedmeny">
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
      {user?.role === "admin" ? (
        <Link href="/brukere" className={pathname.startsWith("/brukere") ? "active" : undefined}>
          Brukere
        </Link>
      ) : null}
      <Link href="/konto" className={pathname.startsWith("/konto") ? "active" : undefined}>
        Konto
      </Link>
      <form action={logout}>
        <button className="nav-button" type="submit">
          Logg ut
        </button>
      </form>
      {user ? <p className="meta">{user.name}</p> : null}
    </nav>
  );
}
