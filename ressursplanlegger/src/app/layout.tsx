import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { Nav } from "@/components/nav";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <a className="brand" href="/">
              <span className="brand-mark">S</span>
              <span>
                <small>Ressursplanlegger</small>
                <strong>Straume</strong>
              </span>
            </a>
            <Nav />
            <p className="side-note">
              Straume Bygg og Betong AS
              <br />
              <a href="/om">Slik beregnes planen</a>
            </p>
          </aside>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
