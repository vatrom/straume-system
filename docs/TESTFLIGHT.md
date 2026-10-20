# Straume Befaring på TestFlight

Appen ligger i `apps/mobile`. Produksjonsbygget heter **Straume Befaring**, med iOS-pakken `no.straumevatrom.befaring`. Den snakker med kontoret på `https://straume.46-62-199-134.sslip.io`.

`.p8`-filen, `EXPO_TOKEN` og Apple-passord skal ikke legges i git.

## 1. Apple Developer Program

1. Gå til [Apple Developer Program](https://developer.apple.com/programs/) og meld på organisasjonen Straume Våtrom AS.
2. Bruk organisasjonens D-U-N-S og en konto som kan godta avtalen. Enkeltmannsforetak kan meldes på som person, men da står personnavnet som utgiver.
3. Vent til medlemskapet er aktivt. Uten det kan verken App Store Connect eller signeringsertifikat opprettes.
4. I [App Store Connect](https://appstoreconnect.apple.com) → Users and Access: legg til den som skal bygge og laste opp, med rolle Admin eller App Manager.

## 2. App-post i App Store Connect

1. Apps → New App.
2. Plattform iOS, navn **Straume Befaring**, språk norsk.
3. Bundle ID må være nøyaktig `no.straumevatrom.befaring`. Opprett den under Certificates, Identifiers & Profiles hvis den ikke finnes.
4. SKU kan være `straume-befaring`.
5. Noter **Apple ID** på app-posten (et tall, for eksempel `1234567890`). Det er `ascAppId`.
6. Team ID står under Membership i Apple Developer. Det er `appleTeamId`, ti tegn.

Bytt ut plassholderne i `apps/mobile/eas.json` før innsending:

```json
"ascAppId": "SETT_INN_ASC_APP_ID",
"appleTeamId": "SETT_INN_APPLE_TEAM_ID"
```

## 3. App Store Connect API-nøkkel

1. App Store Connect → Users and Access → Integrations → App Store Connect API.
2. Generate API Key. Navn for eksempel `EAS Straume`. Tilgang **Admin** eller **App Manager**.
3. Last ned `.p8`-filen med en gang. Apple viser den bare én gang.
4. Noter **Key ID** og **Issuer ID**.
5. Legg `.p8` et sted utenfor repoet, for eksempel `~/.appstore/AuthKey_<KEY_ID>.p8`. Ikke commit den.

Første `eas submit` spør etter nøkkelfilen, key id og issuer id, og lagrer dem hos Expo. I CI kan de samme verdiene settes slik:

```bash
export EXPO_ASC_API_KEY_PATH="$HOME/.appstore/AuthKey_XXXXXXXXXX.p8"
export EXPO_ASC_KEY_ID="XXXXXXXXXX"
export EXPO_ASC_ISSUER_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

## 4. Expo-konto og EXPO_TOKEN

1. Opprett en Expo-konto på [expo.dev](https://expo.dev) og et prosjekt som matcher slug `straume-befaring`, eller la `eas build` opprette det.
2. Access tokens: [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens). Lag en token med tilgang til å bygge.
3. På maskinen som bygger:

```bash
cd apps/mobile
npm install -g eas-cli
export EXPO_TOKEN="lim-inn-token"
eas whoami
```

`eas login` virker også. `EXPO_TOKEN` trengs når bygget kjøres uten nettleser, for eksempel fra en server.

## 5. Bygg

Fra `apps/mobile`:

```bash
eas build -p ios --profile production
```

Profilen `production` setter `EXPO_PUBLIC_API_URL` til kontoret og øker build-nummeret hos EAS. Første gang oppretter EAS distribusjonssertifikat og provisioning profile. Kontoen som svarer må kunne lage sertifikater for teamet.

`preview` er et internt bygg mot samme API, uten innsending til App Store. `development` peker på `http://localhost:3000` og er til lokal utvikling.

## 6. Last opp til TestFlight

Når bygget er ferdig:

```bash
eas submit -p ios --profile production
```

Velg siste bygg. EAS bruker API-nøkkelen fra steg 3 og `ascAppId` / `appleTeamId` fra `eas.json`. Apple behandler bygget i noen minutter. Statusen vises under TestFlight på app-posten.

## 7. Interne testere

Interne testere må være brukere i App Store Connect (Users and Access), ikke bare TestFlight-invitasjoner på e-post.

1. App Store Connect → Straume Befaring → TestFlight.
2. Vent til bygget har status **Ready to Test**. Svar på eksport-spørsmålet (appen bruker ikke kryptering utover HTTPS; velg at den er unntatt).
3. Internal Testing → opprett en gruppe, for eksempel `Kontoret`.
4. Legg til bygget i gruppen.
5. Legg til testere fra listen over App Store Connect-brukere. De får e-post og installerer via TestFlight-appen.
6. Interne testere kan installere med en gang, uten Beta App Review. Opptil 100 interne testere.

Eksterne testere (kunder og montører som ikke har App Store Connect-bruker) krever en egen gruppe under External Testing og en kort Beta App Review første gang.
