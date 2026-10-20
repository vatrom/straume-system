"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Oversikt" },
  { href: "/kapasitet", label: "Kapasitet" },
  { href: "/prosjekter", label: "Prosjekter" },
  { href: "/ressurser", label: "Ressurser" },
];

export function Nav() {
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
    </nav>
  );
}
