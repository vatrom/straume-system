# Straume Våtrom – fase 2

Internt system for salg, prosjektoppfølging og befaring hos Straume Våtrom AS. Grensesnittet er på norsk bokmål. Fase 1 dekker kontor, pipeline, prosjekttavle, befaring uten nett og versjonerte prislister. Fase 2 legger på kalkylemotor, tilbud, tekstmaler, produktkatalog og prisdatabase med stykkliste.

## Kom i gang

Krever Node 22, pnpm 10 og Docker.

```bash
cp .env.example .env
docker compose up --build
```

Kontoret ligger på http://localhost:3000. Filer lagres på disk i volumet `straume-data` (`/app/.data`). Postgres er tilgjengelig på `localhost:5432` med bruker, passord og database `straume`.

Første oppstart kjører migrering og seed. Senere oppstarter legger bare inn rader som mangler. De overskriver ikke faser, tekstmaler, priser eller andre felt en administrator har endret. `SEED_FORCE=1` kjører innsettingene på nytt, men lar fortsatt sannsynlighet og stagnasjonsdager på eksisterende faser stå.

### Valgfri fillagring (S3)

Standard er lokal disk. Tom `S3_ENDPOINT` bruker `DATA_DIR`. En S3-kompatibel tjeneste kan settes inn uten kodeendring, for eksempel [Garage](https://garagehq.deuxfleurs.fr/), [SeaweedFS](https://github.com/seaweedfs/seaweedfs) eller [RustFS](https://github.com/rustfs/rustfs). Legg tjenesten i Compose selv og sett disse variablene på `web`:

```yaml
S3_ENDPOINT: http://garage:3900
S3_REGION: garage
S3_BUCKET: straume
S3_ACCESS_KEY: straume
S3_SECRET_KEY: bytt-meg
```

Appen oppretter bøtta hvis den mangler, og bruker path-style. Nøklene og bøtta kommer fra tjenesten du kjører.

### Uten Docker

```bash
cp .env.example .env
pnpm install
pnpm --filter @straume/db generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Tom `S3_ENDPOINT` lagrer filer på disk i `.data`. Samme variabel kobler på en S3-kompatibel tjeneste, som beskrevet over.

### Demobrukere

Passordet er `bytt-meg-lokalt` (variabelen `SEED_PASSWORD`).

| E-post | Rolle |
|---|---|
| ada.berg@straume.test | admin |
| noah.lien@straume.test | selger |
| mia.solberg@straume.test | prosjektleder |
| eirik.dahl@straume.test | kontor |

Personer, adresser og avtaler i seed er oppdiktet. Ingen ekte kundedata fra Pipedrive er tatt med.

## Befaringsappen i Expo Go

```bash
pnpm --filter @straume/mobile start
```

Skann QR-koden med Expo Go på iPhone, iPad eller Android. Sett API-adressen til maskinen telefonen kan nå, ikke `localhost`:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 pnpm --filter @straume/mobile start
```

På nettleser: `pnpm --filter @straume/mobile web` og åpne http://localhost:8081.

Appen lagrer først lokalt. I Expo Go er lageret SQLite. Nettforhåndsvisningen bruker samme lager-API mot nettleserens lokale lagring, slik at skjermene kan prøves uten enhet. Trykk **Synk** når det er nett. Bilder, video og lyd kopieres inn i appen og lastes opp til prosjektets fillager. De skrives ikke til kamerarullen og ikke til Dropbox.

## Arkitektur

```
apps/web        Next.js-kontor og REST-API
apps/mobile     Expo-app for befaring
packages/domain Rene regler: faser, pris, geometri, synk, synlighet
packages/db     Prisma-skjema, migrering og seed
```

PostgreSQL er kilden på serveren. Ansatte logger inn med e-post og passord. Nettleseren får en httpOnly-cookie, appen får samme JWT som Bearer-token. Rollene er `admin`, `selger`, `prosjektleder` og `kontor`. Alle ansatte ser alle avtaler og prosjekter, slik som i dagens Pipedrive-oppsett. Bare administrator endrer pipelines, faser, valglister, prislister, sjekklister, brukere og Winner-mottaker.

Salgsavtaler og prosjekter er to egne ting, med hvert sitt menypunkt. Salgspipen viser bare åpne avtaler. En vunnet eller tapt avtale forsvinner fra pipen og kan søkes opp i avtalelisten, med filter på status, selger og pipeline.

Når en avtale markeres vunnet, spør kontoret om det skal opprettes et prosjekt med samme navn. Ingenting opprettes uten det svaret. I samme dialog kan oppstartsdato settes. Feltet er frivillig og er forhåndsutfylt med avtalens planlagte oppstart når den finnes. En tom dato blir stående tom. En avtale kan ha ett prosjekt. Kunde, kontraktssum, selger, befaring og dokumenter følger med til første fase i Rehabiliteringsprosjekter. Prosjektleder settes lik selger og kan byttes. Lenken går begge veier. Oppstartsdatoen kan settes og endres senere på prosjektsiden.

Prosjekttavlen viser prosjekter som ikke er markert fullført. Hver fase viser antall og kontraktsum. Kortet viser prosjektleder, planlagt oppstart og planlagt ferdig. Forsinkede og stagnerte prosjekter er merket. Prosjekter uten oppstartsdato har merket «Mangler oppstartsdato» på tavlekortet, i prosjektlisten og på prosjektsiden. Dashboardet har teller og filter «Uten oppstartsdato». Filter på selger og prosjektleder står igjen. «Marker som fullført» tar prosjektet ut av tavlen. «Gjenåpne» legger det tilbake. Fullførte prosjekter søkes opp i prosjektlisten, med filter på status, selger, prosjektleder og år.

Administrator kan fortsatt endre fasene i begge piper, inkludert sannsynlighet og stagnasjonsdager i salg, og stagnasjonsdager på prosjektfasene.

Innsikt tar vare på salgshistorikken: fasebytter, verdiendringer, opprettet, vunnet og tapt, tapsgrunn med fritekst, kildekanal, selger, pipeline og område. Navnet på fasen lagres på hendelsen, så historikken blir stående når en fase døpes om eller slettes. Rapportbyggeren kan vise vunnet, tapt, startet, trakt, fasebevegelser, vektet prognose, snittordre, salgssyklus, tapsgrunner og aktivitet. Mål er sum, antall eller snitt. Gruppering og segment går på selger, pipeline, fase, kilde, tapsgrunn, område og måned, kvartal eller år. Filter kan kombineres, og resultatet kan sammenlignes med forrige periode eller samme periode i fjor. Visningene er søyle, linje, kake, trakt, tabell og nøkkeltall. Et klikk åpner avtalene bak tallet, og utvalget kan eksporteres til CSV og Excel. Rapporter kan lagres og deles. Standarddashbordene er «Salg totalt» og «Per selger». Administrator setter salgsmål for selskapet og per selger. Administrator, kontor og prosjektleder ser alle tall. En selger ser egne tall, med mindre administrator skrur på at selgere kan se hverandre.

Befaring synkes med siste-endring-per-felt. Konflikter logges. Bilder og notater er bare-legg-til: en sletting fra enheten blir avvist. Interne notater, intern media og interne svarnotater fjernes i `projectForAudience` før kundeutsikt og før e-post til tegner.

Skisse er et polygon i meter. Vegger nummereres med klokka fra døra. Omkrets, gulvareal og romhøyde lagres på rommet til mengdeformler i fase 2. Kontoret lager PNG og en enkel PDF, og kan sende dem til tegner. I utvikling skrives e-posten bare til `MailLog`.

## Fase 2: tilbud, kalkyle og produktkatalog

Kalkylen ligger i `@straume/domain` og er deterministisk. Pris per enhet er materialkost × (1 + påslag) + timer × timepris. Mva legges på én gang. Dekningsgrad og dekningsbidrag vises eks. mva. Oppslag går på varekode.

Kildetillegg regnes på arbeidssummen eks. mva, før mva: Byggstart 8 % og MittAnbud XL 5 %. Faktoren 1,3 brukes ikke. Prosentene kan endres på prislisten. Mva legges deretter på summen av arbeid, kildetillegg og eventuelt ekstra fortjeneste.

Elektriker er underleverandør. Postene har fast salgspris, eller innkjøpspris med påslag, og ingen egne timer. Standard timepris er 1 150 kr eks. mva. Faget kan skrus av som underleverandør under Innstillinger. Ekstra oppmøte er 490 kr eks. mva for alle fag, med valgfri overstyring per fag. Flis er 400 kr/m² eks. mva. Kundetekst bruker `{{flis.inntil.ink}}` (500 kr inkl. mva) og `{{flis.inntil}}` for beløpet eks. mva.

Fagrekkefølgen følger tilbudsmalen: riving, tømrer, elektriker, rørlegger, murer/flis, maler. Administrator endrer den under Innstillinger. Samme rekkefølge brukes i tilbudstekst, PDF og den publiserte sjekklisten i befaringsappen.

Uten `ANTHROPIC_API_KEY` lager «Lag tilbudsutkast» et deterministisk utkast fra befaring, sjekkliste og mengdeformler. Med nøkkel kalles Claude med tvunget verktøy `lag_tilbudsutkast`. Modellen velger koder og mengder og skriver tekst. Motoren setter prisen. Prompt og svar logges på tilbudet, med kost ut fra `ANTHROPIC_INPUT_USD_PER_MTOK` (standard 3) og `ANTHROPIC_OUTPUT_USD_PER_MTOK` (standard 15). Interne notater sendes bare merket som interne, og kundetekst som inneholder dem blir renset.

Tilbudet følger utkast → til godkjenning → godkjent → sendt → akseptert eller avslått. Hvem som kan godkjenne, styres av innstillingen `quote_approver_roles` (standard administrator og kontor). Aksept kopierer totalsummen til avtalen og prosjektet. Ny revisjon er et nytt utkast. E-post skrives til `MailLog` og sendes ikke.

Prisdatabasen viser timer og materiell hver for seg, med merke når splittet er utledet eller må kontrolleres. Underleverandørposter er kjent splitt selv om de mangler timer. Justering kan gjelde materiell og timepris hver for seg. Endringer logges. Excel-eksport ligger på prislisten. Planlagte egne timer vises på tilbudet, på prosjektet og i innsikt (`planned_hours`). Underleverandør står som «Underleverandør» og er ikke med i timesummen.

En prispost kan ha en stykkliste: fri sum, eller mengde av et produkt. Produktkatalogen har leverandør, varenummer, NOBB, EAN, navn, enhet, netto kostpris, veil. pris, gyldig fra og kilde-prisfil. Import leser CSV og Excel med lagret kolonnemapping. Formatene `efo`, `nelfo` og `api` har ferdige kolonnenavn. Ny fil viser diff, oppdaterer produkter og regner materialkost på nytt for aktive og utkast-prislister. Tilbudslinjer beholder enhetsprisen de fikk. Poster uten stykkliste beholder enkel materialsum. Utgåtte varer og varer uten pris flagges.

```bash
# valgfritt, ellers brukes mock
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5
```

## Avvik fra arkitekturplanen

- API-et er route handlers i Next.js, ikke en egen prosess.
- Synk er egen feltlogikk i `@straume/domain`, ikke WatermelonDB eller PowerSync.
- Ingen pg-boss, tofaktor eller Microsoft-innlogging i fase 1.
- Ingen import av levende Pipedrive-kunder. Pipeline, faser og valglister er seedet fra eksporten.
- Winner får e-post med PDF og PNG, ikke et eget tegneformat.
- Sjekklisten følger tilbudet og regnearket: riving, tømrer, elektriker, rørlegger, murer/flis, maler. Arkitekturplanen nevnte rørlegger før elektriker. Administrator kan stokke seksjonene.
- Etterfølgende mellomrom i pipelinenavnet «Salgspipe » er fjernet.
- «Befaring avtalt» er satt til 40 % sannsynlighet etter avklaring med Vidar. Pipedrive hadde 100 %. Stagnasjon er fortsatt 14 dager.
- Borettslag og sameier er tatt med som egen pipeline.
- Selger og prosjektleder er to felt. Prosjektleder blir lik selger når et prosjekt opprettes fra en vunnet avtale, og kan byttes etterpå.
- Et prosjekt opprettes ikke automatisk når avtalen vinnes. Kontoret bekrefter det i en dialog.

## Tester

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Domene-testene dekker faser, prisversjon, geometri, synk og filtrering av interne notater. Web-testene kjører det samme mot Postgres: fase-redigering, prisversjon, kundeutsikt, synk, at vunnet avtale ikke lager prosjekt av seg selv, og at fullførte prosjekter ligger i søket og ikke i tavlen.

## Det som er bevisst utsatt

- E-signering. Tilbud kan markeres akseptert internt. Kundeportalens godkjenning kommer senere; endringsordre har `portalStatus` klart.
- Kundeportal og håndverkervisning. Kundeutsikten finnes som API, uten egen innlogging.
- BankID, Vipps og ekte e-postleverandør. `MailProvider` kan byttes; `log` skriver bare til databasen.
- Miniatyrer, gjenopptak av avbrutte opplastinger og push-varsler.
- Automatisk import av historiske Pipedrive-prosjekter.

## Åpne spørsmål

Fra arkitekturplanen, som fortsatt bør avklares med Straume:

- Hvor mange brukere og enheter, og om Android skal testes like grundig som iPhone og iPad.
- Hvor mye Pipedrive-historikk som skal med.
- Hvilket filformat Winner faktisk vil ha, og om e-post til tegner er nok.
- Hvem som godkjenner tilbud, er nå en innstilling. Standard er administrator og kontor. Bekreft om prosjektleder også skal kunne godkjenne.
- Norsk hosting, driftsansvar og e-signering (Signicat, Criipto eller Scrive).

Fra kalkylearket, som påvirker fase 2:

- Dekningsgrad i arket regnes mot sum inkludert mva. Eks. mva gir et lavere tall.
- Like varenavn gjør VLOOKUP feil mellom tømrer og murer. Prislistene her bruker stabile koder (`RIV-001`, `TOM-001`) i stedet.
- Noen salgspriser i regnearket er faste tall og avviker fra underarket. Seed lagrer regnearkets salgspris som overstyring når den avviker.
