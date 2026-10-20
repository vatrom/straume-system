import Link from "next/link";
import { ResourceForm } from "@/components/resource-form";

export default function NyRessursPage() {
  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Link href="/ressurser">Ressurser</Link>
          </p>
          <h1>Ny ressurs</h1>
          <p className="lede">Legg inn navn, fag og hvor mange timer personen kan jobbe i en vanlig uke.</p>
        </div>
      </header>
      <ResourceForm />
    </>
  );
}
