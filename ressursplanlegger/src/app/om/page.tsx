import Link from "next/link";

export default function OmPage() {
  return (
    <article className="prose">
      <h1>Slik beregnes planen</h1>
      <p>
        Planen er bevisst enkel, slik at det er lett å forklare hvorfor en uke er grønn, gul eller rød. All
        fordeling skjer per arbeidsdag. Ukevisningen er bare summen av dagene.
      </p>

      <h2>Arbeidsdag</h2>
      <p>
        Mandag til fredag er arbeidsdager. Lørdag og søndag er ikke det. Dagskapasiteten er ukekapasiteten delt
        på fem. Med standard 37,5 timer blir det 7,5 timer per dag.
      </p>
      <p>
        Norske helligdager er ikke arbeidsdager. Det gjelder blant annet nyttårsdag, skjærtorsdag, langfredag,
        andre påskedag, 1. mai, 17. mai, Kristi himmelfartsdag, andre pinsedag og første og andre juledag.
        Julaften og nyttårsaften er ikke helligdager her. Legg dem inn som fravær hvis dere tar de fri.
      </p>
      <p>Fravær, for eksempel ferie, gjør de dagene til ikke-arbeidsdager for den personen.</p>

      <h2>Hvordan timene fordeles</h2>
      <p>
        Prosjektets timer deles mellom de tildelte aktive personene etter ukekapasitet. En lærling med 30 timer
        i uken får en mindre andel enn en fagarbeider med 37,5.
      </p>
      <ul>
        <li>
          <strong>Med sluttdato</strong> spres personens andel med like mange timer på hver av personens
          arbeidsdager fra oppstart til slutt. Det kan bli mer enn dagskapasiteten. Da blir dagen og uken rød.
        </li>
        <li>
          <strong>Uten sluttdato</strong> jobber de tildelte samtidig, opp til full dagskapasitet, til timene er
          brukt opp. Siste dag kan være en delvis dag. Siste dag med timer er beregnet ferdigdato.
        </li>
      </ul>
      <p>
        Prosjekter som overlapper på samme person, legges sammen. Status «Ferdig» tas ut av planen. Personer som
        ikke er aktive, får ingen timer.
      </p>

      <h2>Fargene</h2>
      <ul>
        <li>Grønn: under 80 % av kapasiteten er booket.</li>
        <li>Gul: 80–100 %. Nesten fullt, også når dagen eller uken er nøyaktig full.</li>
        <li>Rød: over 100 %.</li>
        <li>Grå: ingen kapasitet, som regel fravær eller helligdag.</li>
      </ul>
      <p>
        En uke kan være grønn eller gul selv om én dag er rød. Da vises en prikk i ukevisningen. Dagvisningen
        viser hvilke dager det gjelder.
      </p>
      <p>
        <Link href="/kapasitet">Tilbake til kapasiteten</Link>
      </p>
    </article>
  );
}
