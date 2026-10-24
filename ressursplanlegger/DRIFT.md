# Drift

Kort for den som kjører ressursplanleggeren på serveren. Appen leser fra Tripletex. Den skriver ikke timer, prosjekter eller ansatte tilbake.

## Database

Produksjon bruker Postgres. Lokalt brukes SQLite og `npm run db:setup` (`prisma db push`). Migrasjonene i `prisma/migrations` er bare for Postgres.

Med Postgres starter containeren slik:

```bash
node scripts/prepare-prisma.mjs && npx prisma generate && npx prisma migrate deploy && npx tsx prisma/seed.ts && npm start
```

SQLite-volumet `/data` (når `DATABASE_URL` ikke er Postgres) bruker fortsatt `prisma db push`. Produksjon skal ha Postgres-URL.

`prepare-prisma.mjs` setter provider til postgresql når `DATABASE_URL` starter med `postgres`.

Seed gjør dette hver oppstart:

- Oppretter `admin@straume.no` bare hvis brukeren ikke finnes. Passordet er `ADMIN_INITIAL_PASSWORD`, ellers standardpassordet i README. Det logges ikke.
- Finnes det minst én ressurs, stoppes seed der. Ingenting oppdateres eller dupliseres, og eksempel-tilbudet opprettes ikke på nytt.
- Eksempeldata legges inn bare i en tom database.

### Engangsjobb på databasen som ble laget med db push

Tabellene finnes. `_prisma_migrations` finnes ikke. Ta backup først. Kjør kommandoen én gang med det **nye** imaget, før app-containeren kjører `migrate deploy`. Har containeren allerede feilet på `CREATE TABLE`, er tabellene urørt (Postgres ruller tilbake transaksjonen). Kjør kommandoen da, og start containeren på nytt. Ikke kjør den to ganger.

Bytt nettverk, tilkobling og imagetag.

```bash
docker run --rm \
  --network <docker-nettverket-der-postgres-kjorer> \
  -e DATABASE_URL="postgresql://BRUKER:PASSORD@VERT:5432/DATABASE" \
  --entrypoint sh \
  ressursplanlegger:TAG \
  -c "node scripts/prepare-prisma.mjs && npx prisma migrate resolve --applied 20261021120000_init"
```

Compose, når tjenesten allerede har `DATABASE_URL`:

```bash
docker compose run --rm --entrypoint sh app -c "node scripts/prepare-prisma.mjs && npx prisma migrate resolve --applied 20261021120000_init"
```

Deretter start appen. `migrate deploy` registrerer ikke tabellene på nytt.

## Eksempeldata

Rader merket Eksempel fjernes av en administrator under **Brukere**, knappen **Fjern eksempeldata**. Samme knapp ligger på oversikten for administrator. Egne prosjekter og ressurser blir stående.

## Tripletex-synk

Manuelt: **Hent timer fra Tripletex** under Timer.

Samme jobb kjører `POST /api/tripletex/sync`. Innlogget bruker kan kalle den. Uten økt kreves `Authorization: Bearer` med `SYNC_SECRET` eller `TRIPLETEX_SYNC_SECRET`.

Synken henter timer, oppretter manglende åpne prosjekter og kobler ansatte som har en ansettelse som gjelder i dag. Ansettelsene leses som felt på `/employee`, fordi `/employee/employment` uten `employeeId` kommer tomt tilbake. Mangler ansettelsene, endres ingen ressurser. Bare GET mot Tripletex, pluss sesjon-POST. Lukkede og interne prosjekter som ikke finnes i planleggeren, hoppes over. Koblede prosjekter som er lukket, arkiveres. Koblede interne prosjekter uten tildeling arkiveres på samme måte. Har de tildeling, blir de stående og telles. Allerede importerte timer oppdateres når ressurs eller prosjekt kan kobles. Koblede ansatte uten aktiv ansettelse skjules, eller fjernes hvis de ikke har timer eller tildeling. Innleide, manuelle ressurser og «Ikke med i planleggingen» røres ikke. Feil i uke-status stopper ikke timeimporten. Svaret viser antall som faktisk ble lagret, pluss feilen. HTTP 502 betyr at et steg feilet. JSON-kroppen har likevel tallene. Skriptet skriver ut kroppen før det avslutter med feil.

Koblede prosjekter får oppdatert navn, nummer, kunde og datoer. Timeverk, ressurser, prosent, faser, farge og tilbud overskrives ikke. Nye prosjekter uten timeverk eller folk vises som «Ny fra Tripletex – mangler timeverk/ressurser».

Hver time:

```bash
0 * * * * SYNC_SECRET='hemmeligheten' SYNC_URL='http://127.0.0.1:3000/api/tripletex/sync' /sti/til/ressursplanlegger/scripts/sync-tripletex.sh
```

Hver natt kl. 02.15:

```bash
15 2 * * * SYNC_SECRET='hemmeligheten' SYNC_URL='http://127.0.0.1:3000/api/tripletex/sync' /sti/til/ressursplanlegger/scripts/sync-tripletex.sh
```

Produksjonscontaineren har ikke curl. Kjør skriptet på verten, som over. Det leser headeren fra stdin (`curl -H @-`), så hemmeligheten ikke vises i prosesslisten.

`SYNC_URL` kan peke på det offentlige navnet hvis jobben ikke kjører på samme maskin. Skriptet skriver ikke ut hemmeligheten.
