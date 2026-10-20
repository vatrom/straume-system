# Ressursplanlegger

Enkel kapasitetsplan for **Straume Bygg og Betong AS**. Den viser hvor mange timer håndverkerne er booket, og hvor det er ledig tid, uke for uke og dag for dag.

Flere personer kan bruke samme data. Det er ingen innlogging i denne første versjonen.

## Kom i gang lokalt

Krever Node.js 22.

```bash
cd ressursplanlegger
npm install
npm run db:setup
npm run dev
```

Åpne [http://localhost:3000](http://localhost:3000).

`db:setup` oppretter SQLite-filen `prisma/dev.db` og legger inn eksempeldata merket **Eksempel**. Datoene regnes fra mandagen i inneværende uke, så oversikten viser noe med en gang. Eksempeldata kan slettes fra forsiden.

Kjør testene med:

```bash
npm test
```

## Slik brukes den

- **Oversikt** viser ledige timer de neste fire ukene, uker med overbelastning og hvem som er ledig neste uke.
- **Kapasitet** er hovedbildet. Rader er folk, kolonner er ISO-uker. Klikk en rute for å se prosjektene bak timene. **Dag** viser mandag–fredag. Klikk et ukenummer for å gå til de dagene.
- **Prosjekter** fordeler beregnede timeverk på valgte folk. Når du krysser av, ser du hvor mye ledig tid hver person har i perioden.
- **Ressurser** er håndverkerne: navn, fag, timer per uke (standard 37,5) og om de er aktive. Fravær, for eksempel ferie, legger du inn på personen.

Farger:

| Farge | Betydning |
| --- | --- |
| Grønn | Under 80 % booket. Ledig kapasitet. |
| Gul | 80–100 %. Nesten full, også når uken eller dagen er nøyaktig full. |
| Rød | Over 100 %. Overbelastet. |
| Grå | Ingen kapasitet: fravær eller helligdag. |

En liten prikk i ukevisningen betyr at minst én dag er overbelastet selv om ukesummen ikke er rød.

## Slik fordeles timene

All planlegging skjer **per arbeidsdag**. Ukevisningen summerer mandag–fredag.

En arbeidsdag er mandag–fredag, minus norske helligdager og minus personens fravær. Dagskapasitet er ukekapasitet delt på 5. Standard er 37,5 / 5 = **7,5 timer**.

Helligdagene som er med, er de offisielle: nyttårsdag, skjærtorsdag, langfredag, første og andre påskedag, 1. mai, 17. mai, Kristi himmelfartsdag, første og andre pinsedag, første og andre juledag. Julaften og nyttårsaften er ikke med. Registrer dem som fravær hvis de skal tas fri.

Prosjektets timer deles mellom **aktive** tildelte personer i forhold til ukekapasiteten. En lærling med 30 timer får mindre andel enn en fagarbeider med 37,5.

- **Med sluttdato** spres personens andel med like mange timer på hver av personens arbeidsdager fra oppstart til og med slutt. Det kan bli mer enn 7,5 timer på en dag. Da blir dagen rød, og uken blir rød hvis summen også er over kapasiteten.
- **Uten sluttdato** jobber de tildelte samtidig, opp til full dagskapasitet, fra oppstart til timene er brukt opp. Siste dag kan være en delvis dag. Den dagen er beregnet ferdigdato.

Flere prosjekter på samme person legges sammen. Status **Ferdig** tas ut av planen. Inaktive personer får ingen timer.

Eksempel: Kari og Ole har 37,5 timer i uken og deler 180 timer uten sluttdato. Hver får 90 timer. 90 / 7,5 = 12 arbeidsdager, så begge er fulle (gule) i de dagene. Legges et nytt prosjekt med frist oppå Kari i samme periode, blir hun rød.

Koden ligger i `src/lib/planning.ts` og `src/lib/holidays.ts`. `npm test` låser reglene.

## Data og innlogging senere

Databasen er én SQLite-fil. Den passer for et lite lag som deler én server.

Innlogging er ikke skrudd på. `src/lib/auth.ts` har `requireUser()`, og alle lagringshandlinger kaller den. Senere kan funksjonen lese en ekte sesjon (for eksempel Auth.js) uten at sidene må skrives om.

## Drift

Appen er en Next.js-app med Prisma. For å legge den på en server:

1. Bygg: `npm run build`
2. Sørg for at `DATABASE_URL` peker på en fil på et varig diskvolum, for eksempel `file:/data/app.db`
3. Kjør `npx prisma db push && npx tsx prisma/seed.ts && npm start`

Med Docker, fra denne mappen:

```bash
docker build -t ressursplanlegger .
docker run --rm -p 3000:3000 -v ressursdata:/data ressursplanlegger
```

SQLite tåler noen samtidige brukere, men ikke tung samtidig skriving. Når flere skal lagre samtidig, bytt `provider` i `prisma/schema.prisma` til `postgresql` og sett `DATABASE_URL` til databasen. Skjemaet er det samme.

Eksempeldata legges bare inn når databasen er tom.
