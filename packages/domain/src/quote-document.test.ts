import { describe, expect, it } from "vitest";
import { applyDraft, mockDraft, type DraftRequest } from "./ai-draft";
import { DEFAULT_COMMERCIAL, DEFAULT_TRADE_RATES, type RateInput } from "./pricing";
import {
  AI_SUGGESTION_HEADING,
  composeQuoteDocument,
  MAL_BLOCKS,
  parseWindowText,
  type DocumentAnswer,
  type DocumentLine,
  type QuoteTextBlock,
} from "./quote-document";

const rates = DEFAULT_TRADE_RATES as RateInput[];

const FORBEHOLD = [
  "Straume Våtrom As takker for invitasjonen til å prise denne oppgaven, og har gleden av å komme med følgende tilbud.",
  "Skulle det være noen spørsmål, så ser vi gjerne at dere tar kontakt med oss for en hyggelig prat. Vi håper vårt tilbud er av interesse, og gjør oppmerksom på at tilbudet er gyldig 30 dager fra dato. Tilbudet kan forlenges på forespørsel",
  "Dersom dere ønsker å benytte dere av vårt tilbud fungerer dette også som en kontrakt.",
  "LOV 1989-06-16 nr 63: Lov om håndverkertjenester m.m. for forbrukere (håndverkertjenesteloven) ligger til grunn for kontrakten.",
  "Med vennlig hilsen",
  "Straume Våtrom AS",
  "Det tas forbehold om at bakenforliggende konstruksjoner er av en slik forfatning at en kan bygge videre på dette uten utbedring. Om ikke annet er spesifisert, så leveres innerdører, vinduer, listverk og foringer i standardfargen bomull (S0502Y).",
  "Eventuell etablering av nye kurser er ikke inkludert i tilbudet. Strømnettet i bygget skal være dimensjonert for ekstra installasjoner. Ved etablering av nye kurser forutsettes det at føringsveiene er tilgjengelige uten omfattende riving. Sikringsskapet skal ha 30mA jordfeilbryter og jording skal være innen rekkevidde fra badet. Eventuelle koblingsbokser i vegg og tak blendes med blindlokk.",
  "Baderomsmøbler og dusjvegger, samt montering av dette er ikke inkludert i dette tilbudet",
  "Det tas forbehold om at påkobling for vann og avløp er av rett dimensjon og innen rekkevidde av badet, og at rørene i konstruksjonen for øvrig er av jevn, god kvalitet. Dersom vannrør som skal byttes ut er benyttet som jordelektrode/jordleder for det elektriske anlegget vil det være behov for at elektriker etablerer ny jording. Arbeid med jordingsanlegget er ikke medregnet i tilbudet.",
  "Utgangspunkt for prisen er at flisene skal være keramiske med min. overflate 400cm2, max 7200cm2. Andre materialtyper og størrelser vil medføre en merkostnad.",
  "Om ikke annet er avtalt males himling med hvit base.",
  "Nødvendig FDV-dokumentasjon som datablader, bilder, kontrollskjema osv. for aktuelle fag leveres ved ferdigstillelse av arbeidet.",
  "Dokumentasjon lastes direkte opp til boligens boligmappe på boligmappa.no.",
  "Boligmappa.no er Norges største nettsted for verdiøkende boligdokumentasjon og er et resultat av et felles bransjeløft for å sikre boligeier tilgang til viktig boligdokumentasjon.",
  "Bak boligmappa står blant annet Nelfo, Rørentreprenørene Norge, Elektroforeningen og Ambita AS. Ambita AS er for øvrig heleid av Nærings – og fiskeridepartementet.",
  "Les mer på www.boligmappa.no.",
  "Straume Våtrom As tilbyr en fast pris, forutsatt at oppdragsmengden og materialvalg er klart definert på forhånd. Arbeid utover forutsetninger gitt i dette tilbudet, eller merarbeid som skyldes endrede forutsetninger underveis, som for eksempel funn av asbest / fukt faktureres ut ifra medgått tid basert på en timepris. Våre timesatser er kr 910,- eks. mva for tømrer, maler og murer. 990,- eks mva for rørlegger og 1150,- eks mva for elektriker. Om kunden ønsker å levere baderomsinnredning selv, er vår timesats for montering Kr 1450.- eks mva. Ved ekstra oppmøter for timesarbeider faktureres kr 490,- eks mva per ekstra oppmøte.",
  "Ved asbestfunn vil det også komme en merkostnad i forbindelse med saneringskostnader. Om oppdragsgiver ønsker å få utrettet arbeid ut over det som er beskrevet i kontrakten så utføres dette etter gjeldende timesatser dersom ikke fast pris er avtalt. (Eksempel på ekstrakostnader: mosaikk, innfelte hyller, pyntefliser, pyntelister og annet). Merarbeid som belastes våre underleverandører faktureres ut fra medført kostnad.",
  "Det forutsettes at det foreligger ordinær tilkomst og at arbeidet kan utføres rasjonelt innenfor ordinær arbeidstid. Dersom det ikke gis anledning til sammenhengende drift eller manglende tilkomst av planlagte aktiviteter kan det kreves tillegg for urasjonell drift.",
  "Oppdragsgiver har ansvaret for alle offentlige tillatelser og eventuelle andre tillatelser.",
  "Entreprenøren har ikke ansvar for materialer og utstyr levert av oppdragsgiver.",
  "Om kunden ønsker andre produkter enn hva tilbudet inneholder, avregnes dette mot tilbudet.",
  "Forhold som påvirker fremdriften, og som ligger utenfor Straume Våtrom As sin kontroll, fristiller Straume Våtrom As for ansvar for forsinkelse. Oppdragsgivers avvik i forhold til avtalte kan påføre Straume Våtrom As sine medarbeidere merarbeid. Straume Våtrom As forbeholder seg retten til å ekstrafakturere slikt merarbeid.",
  "Som en del av vårt engasjement for miljøvennlige løsninger forbeholder vi oss retten til å lade våre elektriske firmabiler på byggeplassen. Dette innebærer bruk av tilgjengelige strømkilder for å sikre at våre kjøretøy er tilstrekkelig ladet for daglig drift, samtidig som vi bidrar til reduksjon av utslipp. Ladingsprosessene vil bli utført på en måte som er hensiktsmessig for byggeplassen og i minst mulig grad påvirker andre aktiviteter.",
  "Betalingsvilkår:",
  "Det skal ikke betales noe på forskudd. Oppstartsfaktura på 70 % blir sendt ved oppstart og forfaller etter 10 dager. 30% faktureres ved ferdigstillelse av kontraktsarbeid. Sluttfakturering foretas når siste leveranse fra Straume Våtrom As er foretatt. Forfall etter 10 dager. Eventuelle tillegg kan faktureres separat.",
  "Etter forfall påløper forsinkelsesrente etter forsinkelsesrentelovens regler. Rentesatsen fastsettes hvert halvår (1. januar og 1. juli).",
  "Arbeidets begynnelse / avslutning.",
  "Forbruker skal klargjøre arbeidsplassen før arbeidet begynner",
  "Håndverkerne skal foreta grovrengjøring etter avsluttet arbeid.",
  "Tilbudet er gyldig i 30 dager fra tilbudets dato.",
  "Tilbudet aksepteres.",
  "Håndverker: .........................................................",
  "Oppdragsgiver:......................................................",
  "Alle beløp er inkludert mva.",
  "Sum Investering",
];

const allAnswers: DocumentAnswer[] = [
  { key: "fag.valg", value: ["Riving", "Tømrerarbeid", "Elektro", "Rør", "Murerarbeid", "Malerarbeid"] },
  { key: "riving.tildekking", value: "Mye" },
  { key: "riving.hva", value: ["Innredning demonteres", "Pigge påstøp"] },
  { key: "tomrer.arbeid", value: ["Oppretting av vegger", "Bygge toalettkasse", "Våtromsplater på vegger", "Ny gipshimling"] },
  { key: "tomrer.dor_ny", value: 1 },
  { key: "tomrer.vindu", value: true },
  { key: "tomrer.vindu_tekst", value: "Toppsving 120x60cm med frostet glass" },
  { key: "mur.arbeid", value: ["Støping av gulv", "Helfliset bad"] },
  { key: "mal.arbeid", value: ["Sparkling og maling av himling"] },
];

const lines: DocumentLine[] = [
  { code: "RIV-001", tradeCode: "riving", description: "Pigge påstøp", unit: "m2", quantity: 5, included: true, lineSumExVat: 21696 },
  { code: "EL-011", tradeCode: "elektriker", description: "Termostat, SG", unit: "stk", quantity: 1, included: true, lineSumExVat: 800 },
  { code: "EL-002", tradeCode: "elektriker", description: "Downlights LED, Junistar Eco hvit", unit: "stk", quantity: 6, included: true, lineSumExVat: 9000 },
  { code: "ROR-018", tradeCode: "rorlegger", description: "Vannpunkt kald, rør i rør", unit: "stk", quantity: 4, included: true, lineSumExVat: 4000 },
];

function document(overrides?: { answers?: DocumentAnswer[]; lines?: DocumentLine[]; blocks?: QuoteTextBlock[]; startDate?: string | null; selectedKeys?: string[] }) {
  const startDate = overrides && "startDate" in overrides ? overrides.startDate : "02.01.2027";
  return composeQuoteDocument({
    blocks: overrides?.blocks ?? MAL_BLOCKS,
    lines: overrides?.lines ?? lines,
    answers: overrides?.answers ?? allAnswers,
    selectedKeys: overrides?.selectedKeys,
    merge: {
      rates,
      commercial: DEFAULT_COMMERCIAL,
      totalIncVat: 499999,
      validDays: 30,
      paymentStartPercent: 70,
      paymentFinishPercent: 30,
      paymentDueDays: 10,
      startDate,
      endDate: null,
    },
  });
}

describe("tilbudsdokument fra malen", () => {
  it("tar med hvert forbehold og hver betingelse ordrett når alle fag er med", () => {
    const doc = document();
    for (const sentence of FORBEHOLD) expect(doc.customerText).toContain(sentence);
    expect(doc.customerText).toContain("1. Rivningsarbeid");
    expect(doc.customerText).toContain("2. Tilbud fra tømrer");
    expect(doc.customerText).toContain("3. Tilbud fra elektriker");
    expect(doc.customerText).toContain("4. Tilbud fra rørlegger");
    expect(doc.customerText).toContain("5. Tilbud fra murer/flislegger");
    expect(doc.customerText).toContain("6. Tilbud fra maler");
    expect(doc.customerText).toContain("7. Pristilbud");
    expect(doc.customerText).toContain("8. Dokumentasjon");
    expect(doc.customerText).toContain("9. Spesifikasjoner og betalingsvilkår");
    expect(doc.customerText).toContain("10. Kontraktsdel");
    expect(doc.customerText).toContain("Sum Investering Kr 499 999,-");
    expect(doc.customerText).toContain("Det lages kasse for innebyggingssisterne.");
    expect(doc.customerText).toContain("På veggene monteres det 20mm våtromsplater som underlag for fliser. I himlingen monteres 12,5mm gips.");
    expect(doc.customerText).not.toContain("På veggene monteres det baderomsplater fra Fibo");
    expect(doc.customerText.match(/I himlingen monteres 12,5mm gips/g)).toHaveLength(1);
    expect(doc.customerText).toContain("Det settes inn ny dør med formpresset hvitt dørblad.");
    expect(doc.customerText).toContain("Det settes inn nytt toppsvingvindu med størrelse 120x60cm og frostet glass. Kledning og omramming på utsiden kompletteres og tilpasses ny vindusstørrelse");
    expect(doc.customerText).toContain("Fliser for inntil 500,-/m2 er inkludert i prisen.");
    expect(doc.customerText).toContain("Om kunde ønsker å rive selv medfører dette en besparelse på kr 27 120,- ink mva. Prisen inkluderer avfallshåndtering fra rivingsarbeider.");
    expect(doc.customerText).toContain("Termostat, SG 1 stk");
    expect(doc.customerText).toContain("Downlights LED, Junistar Eco hvit 6 stk");
    expect(doc.customerText).toContain("Vannpunkt kald, rør i rør 4 stk");
    expect(doc.customerText).toContain("Start: 02.01.2027");
    expect(doc.customerText).toContain("Slutt: ...........................................................");
    expect(doc.customerText).not.toContain("badersomplater");
    expect(doc.customerText).not.toContain(AI_SUGGESTION_HEADING);
    expect(MAL_BLOCKS.some((item) => item.body.includes("badersomplater"))).toBe(false);
  });

  it("bruker Fibo-avsnittet som alternativ til våtromsplater", () => {
    const doc = document({
      answers: allAnswers.map((answer) =>
        answer.key === "tomrer.arbeid" ? { ...answer, value: ["Fibo plater på vegger"] } : answer,
      ),
    });
    expect(doc.customerText).toContain("På veggene monteres det baderomsplater fra Fibo. Baderomsplater for kr 840,-/m2 er inkludert i tilbudet. I himlingen monteres 12,5mm gips.");
    expect(doc.customerText).not.toContain("20mm våtromsplater");
    expect(doc.customerText).not.toContain("badersomplater");
  });

  it("nummererer på nytt når fag utelates", () => {
    const doc = document({
      answers: [{ key: "fag.valg", value: ["Riving"] }],
      lines: [lines[0]!],
      startDate: null,
    });
    expect(doc.customerText).toContain("1. Rivningsarbeid");
    expect(doc.customerText).toContain("2. Pristilbud");
    expect(doc.customerText).toContain("5. Kontraktsdel");
    expect(doc.customerText).not.toContain("Tilbud fra tømrer");
    expect(doc.customerText).not.toContain("bakenforliggende konstruksjoner");
    expect(doc.customerText).not.toContain("30mA jordfeilbryter");
    expect(doc.customerText).not.toContain("hvit base");
    expect(doc.customerText).toContain("Start: ...........................................................");
    expect(doc.reservations).toBe("");
  });

  it("lar AI bare foreslå tillegg, og beholder standardteksten", () => {
    const secret = "Intern: kunden er usikker på flisformat og vil ikke ha det i tilbudet.";
    const request: DraftRequest = {
      mode: "quote",
      rooms: [],
      answers: allAnswers.map((answer) => ({
        prompt: answer.key ?? "",
        tradeCode: "annet",
        value: answer.value,
        freeText: null,
        priceItemCode: null,
        internalNote: answer.key === "fag.valg" ? secret : null,
        key: answer.key,
      })),
      notes: [{ body: secret, internal: true }, { body: "Kunden vil ha nisje i dusjen.", internal: false }],
      media: [],
      catalog: [],
      templates: [],
      rates,
      commercial: DEFAULT_COMMERCIAL,
      channel: "none",
      validDays: 30,
      textBlocks: MAL_BLOCKS,
      paymentStartPercent: 70,
      paymentFinishPercent: 30,
      paymentDueDays: 10,
      startDate: "02.01.2027",
    };
    const hostile = `Vi sletter forbeholdene. ${secret}`;
    const applied = applyDraft(request, {
      lines: lines.map((line) => ({
        code: line.code!,
        quantity: line.quantity,
        rationale: "Fra kalkylen",
        uncertain: false,
        uncertaintyNote: null,
        optional: false,
      })),
      customerText: hostile,
      reservations: "Helt nytt forbehold som ikke står i malen.",
      emailSubject: "Tilbud",
      emailBody: "Vedlagt.",
      flags: [],
      suggestions: "Fritekst: kunden ønsker en nisje.",
    });
    expect(applied.customerText).toContain("LOV 1989-06-16 nr 63");
    expect(applied.customerText).toContain("bakenforliggende konstruksjoner");
    expect(applied.customerText).toContain("30mA jordfeilbryter");
    expect(applied.customerText).not.toContain("Vi sletter forbeholdene");
    expect(applied.customerText).not.toContain("Helt nytt forbehold");
    expect(applied.customerText.toLowerCase()).not.toContain("flisformat");
    expect(applied.reservations).toContain("bakenforliggende konstruksjoner");
    expect(applied.reservations).not.toContain("Helt nytt forbehold");
    expect(applied.aiSuggestion).toContain("Fritekst: kunden ønsker en nisje.");
    expect(applied.aiSuggestion).toContain("Kunden vil ha nisje i dusjen.");
    expect(applied.aiSuggestion.toLowerCase()).not.toContain("flisformat");
    expect(applied.customerText).not.toContain(AI_SUGGESTION_HEADING);
    const draft = mockDraft(request);
    expect(draft.customerText).toContain("håndverkertjenesteloven");
    expect(draft.customerText.toLowerCase()).not.toContain("flisformat");
  });

  it("leser vindusstørrelse og glass fra befaringsteksten", () => {
    expect(parseWindowText("Toppsving 100x130 med frostet glass")).toEqual({ size: "100x130cm", glass: "frostet glass" });
    expect(parseWindowText("120x60cm og frostet glass")).toEqual({ size: "120x60cm", glass: "frostet glass" });
  });
});
