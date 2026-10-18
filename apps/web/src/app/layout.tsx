import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";

const sans = Outfit({ subsets: ["latin"], variable: "--font-sans" });
const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Straume Våtrom",
  description: "Salg, prosjekter og befaring for Straume Våtrom AS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
    </html>
  );
}
