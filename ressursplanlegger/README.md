# Ressursplanlegger

Enkel kapasitetsplan for **Straume Bygg og Betong AS**. Den viser hvor mange timer håndverkerne er booket, og hvor det er ledig tid, uke for uke og dag for dag.

Flere personer kan bruke samme data. Innlogging er e-post og passord.

## Kom i gang lokalt

Krever Node.js 22.

```bash
cd ressursplanlegger
npm install
npm run db:setup
npm run dev
```

Åpne [http://localhost:3000](http://localhost:3000).

`db:setup` oppretter SQLite-filen `prisma/dev.db`, en administrator og eksempeldata merket **Eksempel**. Datoene regnes fra mandagen i inneværende uke. Eksempeldata kan slettes fra forsiden.

Logg inn med `admin@straume.no` og passord `Straume2026!` første gang, med mindre `ADMIN_INITIAL_PASSWORD` er satt. Bytt passord under **Konto** med en gang. Administrator oppretter flere brukere under **Brukere**. Engangspassordet vises én gang i skjemaet og skrives ikke til loggen.

Kjør testene med:

```bash
npm test
```

## Slik brukes den

- **Oversikt** viser ledige timer de neste fire ukene, uker med overbelastning og hvem som er ledig neste uke.
- **Kapasitet** er hovedbildet. Rader er folk, kolonner er ISO-uker. Klikk en rute for å se prosjektene bak timene. **Dag** viser mandag–fredag. Klikk et ukenummer for å gå til de dagene.
- **Prosjekter** fordeler beregnede timeverk på valgte folk. Når du krysser av, ser du hvor mye ledig tid hver person har i perioden.
- **Ressurser** er håndverkerne: navn, fag, timer per uke (standard 37,5) og om de er aktive. Fravær, for eksempel ferie, legger du inn på personen.
- Filter på **fag** på oversikt og kapasitet. Hvert fag har en sumrad for ledig kapasitet.
- **Tilbud** er et tentativt prosjekt. Det vises skravert og kan skjules. Knappen «Gjør om til prosjekt» setter status til planlagt.
- På tidslinjen kan du dra en stolpe med musen for å flytte oppstart og slutt (hvis slutt er satt). Dra en person til et annet prosjekt og bekreft. Angre ligger i meldingen etterpå. På nettbrett bruker du **Endre**.
- Hver person kan settes til 100 % eller 50 %. Valgfrie faser har eget tidsrom, timer og folk. Uten faser oppfører prosjektet seg som før.
- Skjemaet advarer mens du fyller inn, for eksempel «Kari Haugen er overbooket i uke 44», og foreslår ledig folk med samme fag.
- **Timer ført** ligger på prosjektet: manuell rad, CSV (`dato,navn,timer,kommentar`, også semikolon) eller Tripletex.

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

Prosjektets timer deles mellom **aktive** tildelte personer i forhold til ukekapasitet ganger prosent. 100 % hos alle gir samme fordeling som før. 50 % halverer vekten, og uten sluttdato jobber personen halv dag. En lærling med 30 timer får mindre andel enn en fagarbeider med 37,5. Har prosjektet faser, planlegges hver fase for seg. Uten faser endres ingenting.

- **Med sluttdato** spres personens andel med like mange timer på hver av personens arbeidsdager fra oppstart til og med slutt. Det kan bli mer enn 7,5 timer på en dag. Da blir dagen rød, og uken blir rød hvis summen også er over kapasiteten.
- **Uten sluttdato** jobber de tildelte samtidig, opp til full dagskapasitet, fra oppstart til timene er brukt opp. Siste dag kan være en delvis dag. Den dagen er beregnet ferdigdato.

Flere prosjekter på samme person legges sammen. Status **Ferdig** tas ut av planen. **Tilbud** er med til dere slår det av. Inaktive personer får ingen timer.

Eksempel: Kari og Ole har 37,5 timer i uken og deler 180 timer uten sluttdato. Hver får 90 timer. 90 / 7,5 = 12 arbeidsdager, så begge er fulle (gule) i de dagene. Legges et nytt prosjekt med frist oppå Kari i samme periode, blir hun rød.

Koden ligger i `src/lib/planning.ts` og `src/lib/holidays.ts`. `npm test` låser reglene.

## Timer fra Tripletex

Timelistene kan hentes fra Tripletex. Appen gjør bare GET-kall mot timene, prosjektene og de ansatte, pluss ett POST for å opprette en sesjon. Den skriver aldri timer, prosjekter eller ansatte tilbake.

Straume Bygg og Betong AS (firma `6682311`) bør lage en **egen API-nøkkel** til denne appen under Firma → API-tilgang i Tripletex, og ikke gjenbruke en personlig nøkkel. Legg nøkkelen i miljøvariabel, aldri i git og aldri i loggen.

```bash
TRIPLETEX_REFRESH_TOKEN="nøkkelen"
TRIPLETEX_BASE_URL="https://tripletex.no/v2"
TRIPLETEX_COMPANY_ID="6682311"
TRIPLETEX_SYNC_SECRET="en lang hemmelighet"
SYNC_SECRET="en lang hemmelighet"
```

Uten nøkkel er knappen «Hent timer fra Tripletex» av. Finnes både `TRIPLETEX_CONSUMER_TOKEN` og `TRIPLETEX_EMPLOYEE_TOKEN`, brukes den kommersielle sesjonen i stedet. Brukernavnet mot Tripletex er `0` (eget firma). Regnskapsførertoken kan sette `TRIPLETEX_USERNAME` til klientens firma-id.

Under **Timer** kobler dere ansatt til ressurs og Tripletex-prosjekt til prosjekt, på id eller prosjektnummer. Treff på navn og nummer foreslås. Knappen «Hent timer fra Tripletex» og `POST /api/tripletex/sync` henter timer og oppretter prosjekter som ikke finnes i planleggeren. Nytt prosjekt får navn, prosjektnummer, kunde, oppstart og slutt når Tripletex har dem, og status Planlagt. Lukkede prosjekter (`isClosed`) og interne prosjekter (`isInternal`) som aldri er importert, hoppes over. Et allerede koblet prosjekt som er lukket, arkiveres og settes til Ferdig, unntatt tilbud. Åpnes det igjen, hentes det tilbake til Planlagt. Navn, nummer, kunde og datoer oppdateres på koblede prosjekter. Timeverk, tildelte ressurser, prosent, faser, farge og tilbud røres ikke. Manuelle prosjekter merkes «Manuell» og arkiveres aldri av synken. Sletter dere et Tripletex-prosjekt, huskes det under «Slettede/ignorerte Tripletex-prosjekter» og opprettes ikke på nytt før «Gjenopprett».

Uke-status leser `year` og `week` på WeekDTO. Spørringen bruker fortsatt `weekYear`. Feiler uke-status, importeres timene likevel, og svaret viser det som faktisk ble lagret.

Prosjekt uten timeverk eller uten folk merkes **Ny fra Tripletex – mangler timeverk/ressurser** på oversikten og i prosjektlisten, til timer og ressurser er fylt inn.

En ansatt tas med bare når `isContact` er false og `/employee/employment` har en ansettelse som overlapper synkedagen. Kontakter, regnskapsfører-proxy og avsluttede ansettelser hoppes over. `allowInformationRegistration` leses, men er ikke et krav. Koblet ressurs uten aktiv ansettelse skjules. Har den ingen timer, fravær eller tildeling, fjernes den. Innleide og manuelt opprettede ressurser røres ikke. «Ikke med i planleggingen» gjør at synken ikke tar personen inn igjen. Ligner navnet bare, opprettes ingen ny ressurs. Uten treff opprettes ressursen med fag «Ukjent». Aktiviteten er ofte «Timer fastpris» og brukes ikke som fag.

Importen er idempotent: samme Tripletex-rad oppdateres, den dupliseres ikke. Timer uten kobling vises i listen, så ingenting forsvinner stille. Sist hentet vises på siden.

Planlagt jobb, for eksempel hver time eller hver natt. `SYNC_SECRET` og `TRIPLETEX_SYNC_SECRET` godtas begge. Skriptet skriver ikke ut hemmeligheten.

```bash
chmod +x scripts/sync-tripletex.sh
# crontab: 0 * * * * SYNC_SECRET='…' SYNC_URL='http://127.0.0.1:3000/api/tripletex/sync' /sti/ressursplanlegger/scripts/sync-tripletex.sh
SYNC_SECRET="en lang hemmelighet" ./scripts/sync-tripletex.sh
```

```bash
curl -fsS -X POST -H "Authorization: Bearer $SYNC_SECRET" http://127.0.0.1:3000/api/tripletex/sync
```

## Innlogging

Passord lagres med scrypt. Sesjonen er en httpOnly-cookie i 14 dager. `requireUser()` brukes av alle lagringshandlinger. Uten cookie sender middleware til `/logg-inn`.

## Drift

Lokalt er databasen SQLite (`DATABASE_URL=file:./dev.db`). `npm run db:setup` bruker `prisma db push`, ikke migrasjonene. Migrasjonene under `prisma/migrations` er PostgreSQL. `scripts/prepare-prisma.mjs` bytter provider til postgresql når `DATABASE_URL` starter med `postgres`, før `prisma generate`. Klienten genereres på nytt når containeren starter, fordi motoren er ulik for SQLite og Postgres.

Med Postgres er oppstart `prisma migrate deploy`, deretter seed. Uten Postgres-URL (SQLite på `/data`) brukes fortsatt `prisma db push`, bare for det lokale volumet. Seed oppretter `admin@straume.no` bare hvis e-posten mangler, og legger inn eksempeldata bare når det ikke finnes noen ressurser. Den oppretter ikke tilbudet på nytt og overskriver ikke eksisterende rader. Administrator fjerner eksempeldata med **Fjern eksempeldata** under Brukere, eller på oversikten.

Produksjon kjører som Docker mot Postgres. Denne mappen deployer ikke av seg selv. Se også `DRIFT.md`.

### Ny Postgres

Tom database får tabellene av `prisma migrate deploy` ved oppstart. Sett `DATABASE_URL` og `ADMIN_INITIAL_PASSWORD`. Uten `DATABASE_URL` bruker imaget SQLite på volumet `/data`.

```bash
docker build -t ressursplanlegger .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://bruker:pass@vert:5432/ressurs" \
  -e ADMIN_INITIAL_PASSWORD="et-langt-passord" \
  -v ressursdata:/data \
  ressursplanlegger
```

### Eksisterende produksjonsdatabase

Databasen som allerede er opprettet med `prisma db push`, har tabellene, men ikke `_prisma_migrations`. Kjør dette **én gang** med det nye imaget, før containeren får kjøre `migrate deploy` (eller etter at den har feilet på `CREATE TABLE`). Ta backup først. Kommandoen kjører ikke SQL på nytt. Kjør den ikke to ganger.

```bash
docker run --rm \
  --network <docker-nettverket-der-postgres-kjorer> \
  -e DATABASE_URL="postgresql://BRUKER:PASSORD@VERT:5432/DATABASE" \
  --entrypoint sh \
  ressursplanlegger:TAG \
  -c "node scripts/prepare-prisma.mjs && npx prisma migrate resolve --applied 20261021120000_init"
```

Med Compose, når `DATABASE_URL` allerede ligger på tjenesten:

```bash
docker compose run --rm --entrypoint sh app -c "node scripts/prepare-prisma.mjs && npx prisma migrate resolve --applied 20261021120000_init"
```

Start deretter app-containeren på nytt. `migrate deploy` ser at initiell migrasjon er registrert og oppretter ikke tabellene på nytt. Seed rører ikke eksisterende data.

### Vercel eller Railway

Samme `DATABASE_URL`. Ikke bruk `prisma db push` mot produksjon. Release-kommando:

```bash
node scripts/prepare-prisma.mjs && npx prisma generate && npx prisma migrate deploy && npx tsx prisma/seed.ts && npm start
```

Har databasen tabeller fra `db push` allerede, kjør `npx prisma migrate resolve --applied 20261021120000_init` én gang etter `prepare-prisma.mjs`, før `migrate deploy`.
