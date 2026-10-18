# Straume Våtrom – fase 1

Internt system for salg, prosjektoppfølging og befaring hos Straume Våtrom AS. Grensesnittet er på norsk bokmål. Fase 1 dekker kontor, pipeline, prosjekttavle, befaring uten nett og versjonerte prislister. Tilbud med AI kommer i fase 2.

## Kom i gang

Krever Node 22, pnpm 10 og Docker.

```bash
cp .env.example .env
docker compose up --build
```

Kontoret ligger på http://localhost:3000. MinIO-konsollet ligger på http://localhost:9001 (`straume` / `straume-dev-secret`). Postgres er tilgjengelig på `localhost:5432` med bruker, passord og database `straume`.

Første oppstart kjører migrering og seed. Seed er idempotent. `SEED_FORCE=1` kjører innsettingene på nytt.

### Uten Docker

```bash
cp .env.example .env
pnpm install
pnpm --filter @straume/db generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Tom `S3_ENDPOINT` lagrer filer på disk i `.data`.

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

En vunnet avtale oppretter et prosjekt på første fase i Rehabiliteringsprosjekter. Selger blir avtalens eier. Prosjektleder settes lik selger og kan byttes. Kontraktsum og adresse kopieres.

Befaring synkes med siste-endring-per-felt. Konflikter logges. Bilder og notater er bare-legg-til: en sletting fra enheten blir avvist. Interne notater, intern media og interne svarnotater fjernes i `projectForAudience` før kundeutsikt og før e-post til tegner.

Skisse er et polygon i meter. Vegger nummereres med klokka fra døra. Omkrets, gulvareal og romhøyde lagres på rommet til mengdeformler i fase 2. Kontoret lager PNG og en enkel PDF, og kan sende dem til tegner. I utvikling skrives e-posten bare til `MailLog`.

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
- Selger og prosjektleder er to felt. Prosjektleder blir lik selger når avtalen vinnes.

## Tester

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Domene-testene dekker faser, prisversjon, geometri, synk og filtrering av interne notater. Web-testene kjører det samme mot Postgres: fase-redigering, prisversjon, kundeutsikt og synk.

## Det som er bevisst utsatt

- Tilbud, AI-utkast og e-signering (fase 2). Modellene `Quote` og `QuoteLine` ligger klare.
- Kundeportal og håndverkervisning. Kundeutsikten finnes som API, uten egen innlogging.
- BankID, Vipps og ekte e-postleverandør. `MailProvider` kan byttes; `log` skriver bare til databasen.
- Miniatyrer, gjenopptak av avbrutte opplastinger og push-varsler.
- Automatisk import av historiske Pipedrive-prosjekter.

## Åpne spørsmål

Fra arkitekturplanen, som fortsatt bør avklares med Straume:

- Hvor mange brukere og enheter, og om Android skal testes like grundig som iPhone og iPad.
- Hvor mye Pipedrive-historikk som skal med.
- Hvilket filformat Winner faktisk vil ha, og om e-post til tegner er nok.
- Hvem som godkjenner tilbud og endringer før de går til kunde.
- Norsk hosting, driftsansvar og e-signering (Signicat, Criipto eller Scrive).

Fra kalkylearket, som påvirker fase 2:

- Dekningsgrad i arket regnes mot sum inkludert mva. Eks. mva gir et lavere tall.
- Like varenavn gjør VLOOKUP feil mellom tømrer og murer. Prislistene her bruker stabile koder (`RIV-001`, `TOM-001`) i stedet.
- Noen salgspriser i regnearket er faste tall og avviker fra underarket. Seed lagrer regnearkets salgspris som overstyring når den avviker.
- Timepriser i tilbudsteksten (elektriker 1 150, ekstra oppmøte 490) stemmer ikke med kalkylen (1 190 og 450/500/550).
- «Flis for inntil 500 kr/m²» i teksten mot 400 kr/m² eks. mva i arket.
