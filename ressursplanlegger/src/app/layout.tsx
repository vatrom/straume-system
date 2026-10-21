import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { headers } from "next/headers";
import { Nav } from "@/components/nav";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

const sans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-source",
  display: "swap",
});

const serif = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ressursplanlegger · Straume Bygg og Betong",
  description: "Oversikt over belastning og ledig kapasitet for håndverkere.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get("x-pathname") ?? "";
  const login = path === "/logg-inn";
  const user = login ? null : await getCurrentUser();

  return (
    <html lang="nb" className={`${sans.variable} ${serif.variable}`}>
      <body>
        {login ? (
          children
        ) : (
          <div className="app-shell">
            <aside className="sidebar">
              <a className="brand" href="/">
                <span className="brand-mark">S</span>
                <span>
                  <small>Ressursplanlegger</small>
                  <strong>Straume</strong>
                </span>
              </a>
              <Nav user={user} />
              <p className="side-note">
                Straume Bygg og Betong AS
                <br />
                <a href="/om">Slik beregnes planen</a>
              </p>
            </aside>
            <main className="app-main">{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
