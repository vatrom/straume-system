import { mergeTemplate, type MergeContext } from "./merge";
import { roundMoney } from "./money";
import { tradeName } from "./trades";

/** Markeres i editoren og i PDF. Standardteksten inneholder ikke dette avsnittet. */
export const AI_SUGGESTION_HEADING = "Forslag fra utkast (ikke standardtekst):";

const DATE_LINE = "...........................................................";

export const DEFAULT_QUOTE_TERMS = {
  validDays: 30,
  paymentStartPercent: 70,
  paymentFinishPercent: 30,
  paymentDueDays: 10,
};

export type BlockInclude = {
  type: "always" | "trade" | "match" | "generated";
  trade?: string;
  choices?: { key: string; anyOf: string[] }[];
  numbers?: { key: string }[];
  codes?: string[];
  trades?: string[];
  /** Tas ikke med når en av disse blokkene allerede er med. */
  omitWhenIncluded?: string[];
};

export type QuoteTextBlock = {
  key: string;
  name: string;
  section: string;
  kind: "description" | "reservation" | "fixed" | "generated";
  body: string;
  sortOrder: number;
  include: BlockInclude;
  locked: boolean;
  aiSelectable: boolean;
};

export type DocumentAnswer = {
  key: string | null;
  value: unknown;
  freeText?: string | null;
};

export type DocumentLine = {
  code: string | null;
  tradeCode: string;
  description: string;
  unit: string;
  quantity: number;
  included: boolean;
  internal?: boolean;
  lineSumExVat: number;
};

export type ComposedQuoteDocument = {
  customerText: string;
  reservations: string;
  sections: { number: number; key: string; title: string }[];
  usedBlockKeys: string[];
};

type SectionSpec = { key: string; title: string; trade: string | null };

export const DOCUMENT_SECTIONS: SectionSpec[] = [
  { key: "riving", title: "Rivningsarbeid", trade: "riving" },
  { key: "tomrer", title: "Tilbud fra tømrer", trade: "tomrer" },
  { key: "elektriker", title: "Tilbud fra elektriker", trade: "elektriker" },
  { key: "rorlegger", title: "Tilbud fra rørlegger", trade: "rorlegger" },
  { key: "murer", title: "Tilbud fra murer/flislegger", trade: "murer" },
  { key: "maler", title: "Tilbud fra maler", trade: "maler" },
  { key: "pristilbud", title: "Pristilbud", trade: null },
  { key: "dokumentasjon", title: "Dokumentasjon", trade: null },
  { key: "spesifikasjoner", title: "Spesifikasjoner og betalingsvilkår", trade: null },
  { key: "kontrakt", title: "Kontraktsdel", trade: null },
];

const TRADE_CHOICE: Record<string, string> = {
  riving: "Riving",
  tomrer: "Tømrerarbeid",
  elektriker: "Elektro",
  rorlegger: "Rør",
  murer: "Murerarbeid",
  maler: "Malerarbeid",
};

const always = (extra?: Partial<BlockInclude>): BlockInclude => ({ type: "always", ...extra });
const whenTrade = (trade: string): BlockInclude => ({ type: "trade", trade });
const generated = (trade: string): BlockInclude => ({ type: "generated", trade });
const match = (include: Omit<BlockInclude, "type">): BlockInclude => ({ type: "match", ...include });

function block(
  partial: Omit<QuoteTextBlock, "locked" | "aiSelectable" | "kind"> & { kind?: QuoteTextBlock["kind"]; locked?: boolean; aiSelectable?: boolean },
): QuoteTextBlock {
  const kind = partial.kind ?? "description";
  return {
    ...partial,
    kind,
    locked: partial.locked ?? true,
    aiSelectable: partial.aiSelectable ?? kind === "description",
  };
}

/**
 * Ordrette avsnitt fra Tilbud_MAL.
 * Eneste retting er skrivefeilen «badersomplater» → «baderomsplater».
 * Tall som skal følge prislisten eller kalkylen, står som flettefelt.
 */
export const MAL_BLOCKS: QuoteTextBlock[] = [
  block({
    key: "intro.takk",
    name: "Takk for invitasjonen",
    section: "intro",
    kind: "fixed",
    sortOrder: 10,
    include: always(),
    aiSelectable: false,
    body: "Straume Våtrom As takker for invitasjonen til å prise denne oppgaven, og har gleden av å komme med følgende tilbud.",
  }),
  block({
    key: "intro.sporsmal",
    name: "Gyldighet",
    section: "intro",
    kind: "fixed",
    sortOrder: 20,
    include: always(),
    aiSelectable: false,
    body: "Skulle det være noen spørsmål, så ser vi gjerne at dere tar kontakt med oss for en hyggelig prat. Vi håper vårt tilbud er av interesse, og gjør oppmerksom på at tilbudet er gyldig {{gyldighet.dager}} dager fra dato. Tilbudet kan forlenges på forespørsel",
  }),
  block({
    key: "intro.kontrakt",
    name: "Tilbudet er en kontrakt",
    section: "intro",
    kind: "fixed",
    sortOrder: 30,
    include: always(),
    aiSelectable: false,
    body: "Dersom dere ønsker å benytte dere av vårt tilbud fungerer dette også som en kontrakt.",
  }),
  block({
    key: "intro.lov",
    name: "Håndverkertjenesteloven",
    section: "intro",
    kind: "fixed",
    sortOrder: 40,
    include: always(),
    aiSelectable: false,
    body: "LOV 1989-06-16 nr 63: Lov om håndverkertjenester m.m. for forbrukere (håndverkertjenesteloven) ligger til grunn for kontrakten.",
  }),
  block({
    key: "intro.hilsen",
    name: "Hilsen",
    section: "intro",
    kind: "fixed",
    sortOrder: 50,
    include: always(),
    aiSelectable: false,
    body: "Med vennlig hilsen\n\nStraume Våtrom AS",
  }),
  block({
    key: "riving.rigg",
    name: "Rigging og tildekking",
    section: "riving",
    sortOrder: 10,
    include: match({ choices: [{ key: "riving.tildekking", anyOf: ["Lite", "Middels", "Mye"] }], trades: ["riving"] }),
    body: "Rigging av arbeidsplass, tildekking av tilstøtende arealer.",
  }),
  block({
    key: "riving.demontering",
    name: "Demontering og riving",
    section: "riving",
    sortOrder: 20,
    include: match({
      choices: [
        {
          key: "riving.hva",
          anyOf: [
            "Innredning demonteres",
            "Pigge påstøp",
            "Pigge gulvstøp mot grunn",
            "Pigge gulvstøp kun i dusj",
            "Pigge opp gulvfliser",
            "Fjerne gulvbelegg",
            "Fliskledning på vegger",
            "Platekledning på vegger",
            "Rive himling",
          ],
        },
      ],
      codes: ["RIV-001"],
      trades: ["riving"],
    }),
    body: "Innredning demonteres. Vegg -og takflater rives. Påstøp/gulvflis/gulvbelegg pigges opp. Avfallet fraktes bort. Generell avfallshåndtering under byggeprosessen.",
  }),
  block({
    key: "riving.selv",
    name: "Besparelse ved egenriving",
    section: "riving",
    sortOrder: 30,
    include: whenTrade("riving"),
    body: "Om kunde ønsker å rive selv medfører dette en besparelse på kr {{riving.sum.ink}},- ink mva. Prisen inkluderer avfallshåndtering fra rivingsarbeider.",
  }),
  block({
    key: "tomrer.oppretting",
    name: "Oppretting",
    section: "tomrer",
    sortOrder: 10,
    include: match({ choices: [{ key: "tomrer.arbeid", anyOf: ["Oppretting av vegger"] }], codes: ["TOM-012"] }),
    body: "Vegger og tak rettes opp, og det legges spikerslag for plater og innredning",
  }),
  block({
    key: "tomrer.kasse",
    name: "Toalettkasse",
    section: "tomrer",
    sortOrder: 20,
    include: match({ choices: [{ key: "tomrer.arbeid", anyOf: ["Bygge toalettkasse"] }] }),
    body: "Det lages kasse for innebyggingssisterne.",
  }),
  block({
    key: "tomrer.vatrom",
    name: "Våtromsplater",
    section: "tomrer",
    sortOrder: 30,
    include: match({ choices: [{ key: "tomrer.arbeid", anyOf: ["Våtromsplater på vegger"] }], codes: ["TOM-002"] }),
    body: "På veggene monteres det 20mm våtromsplater som underlag for fliser. I himlingen monteres 12,5mm gips.",
  }),
  block({
    key: "tomrer.fibo",
    name: "Fibo-plater",
    section: "tomrer",
    sortOrder: 40,
    include: match({ choices: [{ key: "tomrer.arbeid", anyOf: ["Fibo plater på vegger"] }], codes: ["TOM-001"] }),
    body: "På veggene monteres det baderomsplater fra Fibo. Baderomsplater for kr 840,-/m2 er inkludert i tilbudet. I himlingen monteres 12,5mm gips.",
  }),
  block({
    key: "tomrer.gips",
    name: "Gips i himling",
    section: "tomrer",
    sortOrder: 50,
    include: match({
      choices: [{ key: "tomrer.arbeid", anyOf: ["Ny gipshimling"] }],
      codes: ["TOM-004"],
      omitWhenIncluded: ["tomrer.vatrom", "tomrer.fibo"],
    }),
    body: "I himlingen monteres 12,5mm gips.",
  }),
  block({
    key: "tomrer.dor",
    name: "Ny dør",
    section: "tomrer",
    sortOrder: 60,
    include: match({ numbers: [{ key: "tomrer.dor_ny" }], codes: ["TOM-009"] }),
    body: "Det settes inn ny dør med formpresset hvitt dørblad.",
  }),
  block({
    key: "tomrer.vindu",
    name: "Nytt vindu",
    section: "tomrer",
    sortOrder: 70,
    include: match({ choices: [{ key: "tomrer.vindu", anyOf: ["ja"] }] }),
    body: "Det settes inn nytt toppsvingvindu med størrelse {{vindu.storrelse}} og {{vindu.glass}}. Kledning og omramming på utsiden kompletteres og tilpasses ny vindusstørrelse",
  }),
  block({
    key: "tomrer.list",
    name: "Foring og list",
    section: "tomrer",
    sortOrder: 80,
    include: match({
      numbers: [{ key: "tomrer.dor_ny" }, { key: "tomrer.dor_behold" }],
      choices: [{ key: "tomrer.vindu", anyOf: ["ja"] }],
      codes: ["TOM-008", "TOM-009"],
    }),
    body: "Dør og vindu fores ut og listes med 12x58 hvitmalt list. Terskel suppleres med eikelister.",
  }),
  block({
    key: "tomrer.forbehold",
    name: "Forbehold tømrer",
    section: "tomrer",
    kind: "reservation",
    sortOrder: 90,
    aiSelectable: false,
    include: whenTrade("tomrer"),
    body: "Det tas forbehold om at bakenforliggende konstruksjoner er av en slik forfatning at en kan bygge videre på dette uten utbedring. Om ikke annet er spesifisert, så leveres innerdører, vinduer, listverk og foringer i standardfargen bomull (S0502Y).",
  }),
  block({
    key: "elektriker.poster",
    name: "Elektrikerposter",
    section: "elektriker",
    kind: "generated",
    sortOrder: 10,
    aiSelectable: false,
    include: generated("elektriker"),
    body: "",
  }),
  block({
    key: "elektriker.forbehold",
    name: "Forbehold elektriker",
    section: "elektriker",
    kind: "reservation",
    sortOrder: 20,
    aiSelectable: false,
    include: whenTrade("elektriker"),
    body: "Eventuell etablering av nye kurser er ikke inkludert i tilbudet. Strømnettet i bygget skal være dimensjonert for ekstra installasjoner. Ved etablering av nye kurser forutsettes det at føringsveiene er tilgjengelige uten omfattende riving. Sikringsskapet skal ha 30mA jordfeilbryter og jording skal være innen rekkevidde fra badet. Eventuelle koblingsbokser i vegg og tak blendes med blindlokk.",
  }),
  block({
    key: "rorlegger.poster",
    name: "Rørleggerposter",
    section: "rorlegger",
    kind: "generated",
    sortOrder: 10,
    aiSelectable: false,
    include: generated("rorlegger"),
    body: "",
  }),
  block({
    key: "rorlegger.mobler",
    name: "Møbler og dusjvegger",
    section: "rorlegger",
    kind: "reservation",
    sortOrder: 20,
    aiSelectable: false,
    include: whenTrade("rorlegger"),
    body: "Baderomsmøbler og dusjvegger, samt montering av dette er ikke inkludert i dette tilbudet",
  }),
  block({
    key: "rorlegger.forbehold",
    name: "Forbehold rørlegger",
    section: "rorlegger",
    kind: "reservation",
    sortOrder: 30,
    aiSelectable: false,
    include: whenTrade("rorlegger"),
    body: "Det tas forbehold om at påkobling for vann og avløp er av rett dimensjon og innen rekkevidde av badet, og at rørene i konstruksjonen for øvrig er av jevn, god kvalitet. Dersom vannrør som skal byttes ut er benyttet som jordelektrode/jordleder for det elektriske anlegget vil det være behov for at elektriker etablerer ny jording. Arbeid med jordingsanlegget er ikke medregnet i tilbudet.",
  }),
  block({
    key: "murer.stop",
    name: "Støping",
    section: "murer",
    sortOrder: 10,
    include: match({ choices: [{ key: "mur.arbeid", anyOf: ["Støping av gulv"] }], codes: ["MUR-001"] }),
    body: "Støping av gulv med fall iht teknisk forskrift.",
  }),
  block({
    key: "murer.membran",
    name: "Membran",
    section: "murer",
    sortOrder: 20,
    include: match({
      choices: [{ key: "mur.arbeid", anyOf: ["Støping av gulv", "Helfliset bad", "Delvis flislagte vegger", "Gulvfliser med sokkel", "Gulvbelegg"] }],
      codes: ["MUR-001", "MUR-002", "MUR-008", "MUR-014"],
    }),
    body: "Membran legges på gulv med oppbrett på vegg, og i alle våtsoner på vegg.",
  }),
  block({
    key: "murer.flis",
    name: "Flislegging",
    section: "murer",
    sortOrder: 30,
    include: match({
      choices: [{ key: "mur.arbeid", anyOf: ["Helfliset bad", "Delvis flislagte vegger", "Gulvfliser med sokkel"] }],
      codes: ["MUR-002", "MUR-003", "MUR-008"],
    }),
    body: "Komplett flislegging av gulv og vegger inkl. fuging og silikonering. Flisene avsluttes mot taket med silikonfuge. Utvendige hjørner suppleres med metallister i krom.",
  }),
  block({
    key: "murer.godtgjorelse",
    name: "Flisgodtgjørelse",
    section: "murer",
    sortOrder: 40,
    include: match({
      choices: [{ key: "mur.arbeid", anyOf: ["Helfliset bad", "Delvis flislagte vegger", "Gulvfliser med sokkel", "Gulvbelegg"] }],
      codes: ["MUR-002", "MUR-003", "MUR-008", "MUR-014"],
    }),
    body: "Fliser for inntil {{flis.inntil.ink}},-/m2 er inkludert i prisen.",
  }),
  block({
    key: "murer.forbehold",
    name: "Forbehold murer",
    section: "murer",
    kind: "reservation",
    sortOrder: 50,
    aiSelectable: false,
    include: whenTrade("murer"),
    body: "Utgangspunkt for prisen er at flisene skal være keramiske med min. overflate 400cm2, max 7200cm2. Andre materialtyper og størrelser vil medføre en merkostnad.",
  }),
  block({
    key: "maler.himling",
    name: "Sparkling og maling",
    section: "maler",
    sortOrder: 10,
    include: match({
      choices: [{ key: "mal.arbeid", anyOf: ["Sparkling og maling av himling"] }],
      codes: ["MAL-004", "MAL-005"],
    }),
    body: "Sparkling og maling av himling.",
  }),
  block({
    key: "maler.forbehold",
    name: "Forbehold maler",
    section: "maler",
    kind: "reservation",
    sortOrder: 20,
    aiSelectable: false,
    include: whenTrade("maler"),
    body: "Om ikke annet er avtalt males himling med hvit base.",
  }),
  block({
    key: "pristilbud.sum",
    name: "Sum investering",
    section: "pristilbud",
    kind: "fixed",
    sortOrder: 10,
    aiSelectable: false,
    include: always(),
    body: "Sum Investering Kr {{total.ink}},-\nAlle beløp er inkludert mva.",
  }),
  block({
    key: "dokumentasjon.fdv",
    name: "Dokumentasjon",
    section: "dokumentasjon",
    kind: "fixed",
    sortOrder: 10,
    aiSelectable: false,
    include: always(),
    body: [
      "Nødvendig FDV-dokumentasjon som datablader, bilder, kontrollskjema osv. for aktuelle fag leveres ved ferdigstillelse av arbeidet.",
      "Dokumentasjon lastes direkte opp til boligens boligmappe på boligmappa.no.",
      "Boligmappa.no er Norges største nettsted for verdiøkende boligdokumentasjon og er et resultat av et felles bransjeløft for å sikre boligeier tilgang til viktig boligdokumentasjon.",
      "Bak boligmappa står blant annet Nelfo, Rørentreprenørene Norge, Elektroforeningen og Ambita AS. Ambita AS er for øvrig heleid av Nærings – og fiskeridepartementet.",
      "Les mer på www.boligmappa.no.",
    ].join("\n\n"),
  }),
  block({
    key: "spesifikasjoner.vilkar",
    name: "Spesifikasjoner og betalingsvilkår",
    section: "spesifikasjoner",
    kind: "fixed",
    sortOrder: 10,
    aiSelectable: false,
    include: always(),
    body: [
      "Straume Våtrom As tilbyr en fast pris, forutsatt at oppdragsmengden og materialvalg er klart definert på forhånd. Arbeid utover forutsetninger gitt i dette tilbudet, eller merarbeid som skyldes endrede forutsetninger underveis, som for eksempel funn av asbest / fukt faktureres ut ifra medgått tid basert på en timepris. Våre timesatser er kr {{timepris.tomrer}},- eks. mva for tømrer, maler og murer. {{timepris.rorlegger}},- eks mva for rørlegger og {{timepris.elektriker}},- eks mva for elektriker. Om kunden ønsker å levere baderomsinnredning selv, er vår timesats for montering Kr {{timepris.montering}}.- eks mva. Ved ekstra oppmøter for timesarbeider faktureres kr {{oppmote.ekstra}},- eks mva per ekstra oppmøte.",
      "Ved asbestfunn vil det også komme en merkostnad i forbindelse med saneringskostnader. Om oppdragsgiver ønsker å få utrettet arbeid ut over det som er beskrevet i kontrakten så utføres dette etter gjeldende timesatser dersom ikke fast pris er avtalt. (Eksempel på ekstrakostnader: mosaikk, innfelte hyller, pyntefliser, pyntelister og annet). Merarbeid som belastes våre underleverandører faktureres ut fra medført kostnad.",
      "Det forutsettes at det foreligger ordinær tilkomst og at arbeidet kan utføres rasjonelt innenfor ordinær arbeidstid. Dersom det ikke gis anledning til sammenhengende drift eller manglende tilkomst av planlagte aktiviteter kan det kreves tillegg for urasjonell drift.",
      "Oppdragsgiver har ansvaret for alle offentlige tillatelser og eventuelle andre tillatelser.",
      "Entreprenøren har ikke ansvar for materialer og utstyr levert av oppdragsgiver.",
      "Om kunden ønsker andre produkter enn hva tilbudet inneholder, avregnes dette mot tilbudet.",
      "Forhold som påvirker fremdriften, og som ligger utenfor Straume Våtrom As sin kontroll, fristiller Straume Våtrom As for ansvar for forsinkelse. Oppdragsgivers avvik i forhold til avtalte kan påføre Straume Våtrom As sine medarbeidere merarbeid. Straume Våtrom As forbeholder seg retten til å ekstrafakturere slikt merarbeid.",
      "Som en del av vårt engasjement for miljøvennlige løsninger forbeholder vi oss retten til å lade våre elektriske firmabiler på byggeplassen. Dette innebærer bruk av tilgjengelige strømkilder for å sikre at våre kjøretøy er tilstrekkelig ladet for daglig drift, samtidig som vi bidrar til reduksjon av utslipp. Ladingsprosessene vil bli utført på en måte som er hensiktsmessig for byggeplassen og i minst mulig grad påvirker andre aktiviteter.",
      "Betalingsvilkår:\nDet skal ikke betales noe på forskudd. Oppstartsfaktura på {{betaling.oppstart}} % blir sendt ved oppstart og forfaller etter {{betaling.forfall}} dager. {{betaling.ferdig}}% faktureres ved ferdigstillelse av kontraktsarbeid. Sluttfakturering foretas når siste leveranse fra Straume Våtrom As er foretatt. Forfall etter {{betaling.forfall}} dager. Eventuelle tillegg kan faktureres separat.\nEtter forfall påløper forsinkelsesrente etter forsinkelsesrentelovens regler. Rentesatsen fastsettes hvert halvår (1. januar og 1. juli).",
    ].join("\n\n"),
  }),
  block({
    key: "kontrakt.del",
    name: "Kontraktsdel",
    section: "kontrakt",
    kind: "fixed",
    sortOrder: 10,
    aiSelectable: false,
    include: always(),
    body: [
      "Arbeidets begynnelse / avslutning.",
      "Start: {{oppstart.dato}}",
      "Slutt: {{slutt.dato}}",
      "Forbruker skal klargjøre arbeidsplassen før arbeidet begynner",
      "Håndverkerne skal foreta grovrengjøring etter avsluttet arbeid.",
      "Tilbudet er gyldig i {{gyldighet.dager}} dager fra tilbudets dato.",
      "Tilbudet aksepteres.",
      "Håndverker: .........................................................",
      "Oppdragsgiver:......................................................",
    ].join("\n\n"),
  }),
];

export function asBlockInclude(value: unknown): BlockInclude | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as BlockInclude;
  if (raw.type !== "always" && raw.type !== "trade" && raw.type !== "match" && raw.type !== "generated") return null;
  return {
    type: raw.type,
    trade: typeof raw.trade === "string" ? raw.trade : undefined,
    choices: Array.isArray(raw.choices)
      ? raw.choices
          .filter((choice) => choice && typeof choice.key === "string" && Array.isArray(choice.anyOf))
          .map((choice) => ({ key: choice.key, anyOf: choice.anyOf.map(String) }))
      : undefined,
    numbers: Array.isArray(raw.numbers) ? raw.numbers.filter((item) => item && typeof item.key === "string").map((item) => ({ key: item.key })) : undefined,
    codes: Array.isArray(raw.codes) ? raw.codes.map(String) : undefined,
    trades: Array.isArray(raw.trades) ? raw.trades.map(String) : undefined,
    omitWhenIncluded: Array.isArray(raw.omitWhenIncluded) ? raw.omitWhenIncluded.map(String) : undefined,
  };
}

export function describeBlockLink(block: QuoteTextBlock): string {
  const include = block.include;
  if (include.type === "always") return "Alltid";
  if (include.type === "trade") return `Alltid når ${tradeName(include.trade ?? "")} er med`;
  if (include.type === "generated") return `Produkt og antall genereres fra kalkylepostene for ${tradeName(include.trade ?? "")}`;
  const parts: string[] = [];
  for (const choice of include.choices ?? []) parts.push(`sjekkliste ${choice.key}: ${choice.anyOf.join(", ")}`);
  for (const item of include.numbers ?? []) parts.push(`antall på ${item.key}`);
  if (include.codes?.length) parts.push(`varekoder ${include.codes.join(", ")}`);
  if (include.trades?.length) parts.push(`når ${include.trades.map((trade) => tradeName(trade)).join(", ")} er med`);
  return parts.join(" · ") || "Når tilhørende arbeid er med";
}

export function parseWindowText(text: string): { size: string; glass: string } {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return { size: "", glass: "" };
  const sizeMatch = raw.match(/(\d{2,4}\s*[x×]\s*\d{2,4}\s*cm)/i) ?? raw.match(/(\d{2,4}\s*[x×]\s*\d{2,4})/i);
  const size = sizeMatch ? sizeMatch[1]!.replace(/\s+/g, "").replace("×", "x").replace(/cm$/i, "") + "cm" : raw;
  const glassMatch = raw.match(/(frostet(?:\s+glass)?|klart(?:\s+glass)?|ornament(?:glass)?|sotet(?:\s+glass)?|melkeglass)/i);
  let glass = "";
  if (glassMatch) {
    const word = glassMatch[1]!.toLowerCase();
    glass = word.includes("glass") ? word : `${word} glass`;
  } else if (sizeMatch) {
    const rest = raw
      .replace(sizeMatch[0], "")
      .replace(/toppsving(vindu)?/gi, "")
      .replace(/\bmed\b/gi, "")
      .replace(/\bog\b/gi, "")
      .replace(/[.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    glass = rest || raw;
  } else {
    glass = raw;
  }
  return { size, glass };
}

function labelsOf(value: unknown): string[] {
  if (value === true) return ["ja"];
  if (value === false || value == null) return [];
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function answerLabels(answers: DocumentAnswer[], key: string): string[] {
  return answers.filter((answer) => answer.key === key).flatMap((answer) => labelsOf(answer.value));
}

function answerNumber(answers: DocumentAnswer[], key: string): number {
  const found = answers.find((answer) => answer.key === key);
  if (!found) return 0;
  if (typeof found.value === "number") return found.value;
  if (typeof found.value === "string" && found.value.trim()) {
    const parsed = Number(found.value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function tradeIncluded(trade: string, lines: DocumentLine[], answers: DocumentAnswer[]): boolean {
  if (lines.some((line) => line.included && !line.internal && line.tradeCode === trade && line.quantity > 0)) return true;
  const choice = TRADE_CHOICE[trade];
  return Boolean(choice && answerLabels(answers, "fag.valg").includes(choice));
}

function conditionMatches(include: BlockInclude, lines: DocumentLine[], answers: DocumentAnswer[]): boolean {
  if (include.type === "always") return true;
  if (include.type === "trade" || include.type === "generated") return tradeIncluded(include.trade ?? "", lines, answers);
  const checks: boolean[] = [];
  for (const choice of include.choices ?? []) {
    const labels = answerLabels(answers, choice.key);
    checks.push(choice.anyOf.some((value) => labels.includes(value)));
  }
  for (const item of include.numbers ?? []) checks.push(answerNumber(answers, item.key) > 0);
  for (const code of include.codes ?? []) {
    checks.push(lines.some((line) => line.included && !line.internal && line.code === code && line.quantity > 0));
  }
  for (const trade of include.trades ?? []) checks.push(tradeIncluded(trade, lines, answers));
  return checks.some(Boolean);
}

function formatQty(quantity: number): string {
  return quantity.toLocaleString("nb-NO", { maximumFractionDigits: 2 });
}

function productLines(lines: DocumentLine[], trade: string): string[] {
  return lines
    .filter((line) => line.included && !line.internal && line.tradeCode === trade && line.quantity > 0)
    .filter((line) => !line.description.startsWith("Må prises manuelt"))
    .map((line) => `${line.description} ${formatQty(line.quantity)} ${line.unit}`.trim());
}

function windowFields(answers: DocumentAnswer[]): { size: string; glass: string } {
  const found = answers.find((answer) => answer.key === "tomrer.vindu_tekst");
  const text = [typeof found?.value === "string" ? found.value : "", found?.freeText ?? ""].filter(Boolean).join(" ");
  return parseWindowText(text);
}

function withDocumentFields(merge: MergeContext, lines: DocumentLine[], answers: DocumentAnswer[]): MergeContext {
  const rivingEx = lines
    .filter((line) => line.included && !line.internal && line.tradeCode === "riving")
    .reduce((sum, line) => sum + line.lineSumExVat, 0);
  const window = windowFields(answers);
  return {
    ...merge,
    validDays: merge.validDays ?? DEFAULT_QUOTE_TERMS.validDays,
    paymentStartPercent: merge.paymentStartPercent ?? DEFAULT_QUOTE_TERMS.paymentStartPercent,
    paymentFinishPercent: merge.paymentFinishPercent ?? DEFAULT_QUOTE_TERMS.paymentFinishPercent,
    paymentDueDays: merge.paymentDueDays ?? DEFAULT_QUOTE_TERMS.paymentDueDays,
    rivingSumIncVat: roundMoney(rivingEx * (1 + (merge.commercial.vatRate ?? 0.25))),
    windowSize: window.size || null,
    windowGlass: window.glass || null,
    startDate: merge.startDate?.trim() ? merge.startDate : DATE_LINE,
    endDate: merge.endDate?.trim() ? merge.endDate : DATE_LINE,
  };
}

export function composeQuoteDocument(input: {
  blocks: QuoteTextBlock[];
  lines: DocumentLine[];
  answers: DocumentAnswer[];
  merge: MergeContext;
  selectedKeys?: string[] | null;
}): ComposedQuoteDocument {
  const selected = new Set(input.selectedKeys ?? []);
  const merge = withDocumentFields(input.merge, input.lines, input.answers);
  const prelim = input.blocks.filter((item) => {
    if (conditionMatches(item.include, input.lines, input.answers)) return true;
    if (!item.aiSelectable || !selected.has(item.key)) return false;
    const trade = DOCUMENT_SECTIONS.find((section) => section.key === item.section)?.trade;
    return !trade || tradeIncluded(trade, input.lines, input.answers);
  });
  const chosenKeys = new Set(prelim.map((item) => item.key));
  const chosen = prelim
    .filter((item) => !(item.include.omitWhenIncluded ?? []).some((key) => chosenKeys.has(key)))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const sections = DOCUMENT_SECTIONS.flatMap((section) => {
    const blocks = chosen.filter((item) => item.section === section.key);
    if (blocks.length === 0) return [];
    return [{ ...section, blocks }];
  }).map((section, index) => ({ ...section, number: index + 1 }));

  const fill = (body: string) => mergeTemplate(body, merge).trim();
  const introKeys = ["intro.takk", "intro.sporsmal", "intro.kontrakt", "intro.lov", "intro.hilsen"];
  const introBody = (key: string) => {
    const found = chosen.find((item) => item.key === key);
    return found ? fill(found.body) : "";
  };
  const contents = ["Tilbudet inneholder følgende poster:", "", ...sections.map((section) => `${section.number}. ${section.title}`)].join("\n");
  const intro = [introBody("intro.takk"), contents, ...introKeys.slice(1).map(introBody)].filter(Boolean).join("\n\n");

  const rendered = sections.map((section) => {
    const parts: string[] = [`${section.number}. ${section.title}`];
    for (const item of section.blocks) {
      if (item.kind === "generated") {
        const trade = item.include.trade ?? section.trade ?? "";
        parts.push(...productLines(input.lines, trade));
        continue;
      }
      const text = fill(item.body);
      if (text) parts.push(text);
    }
    return parts.join("\n\n");
  });

  const sectionRank = new Map(DOCUMENT_SECTIONS.map((section, index) => [section.key, index]));
  const reservations = chosen
    .filter((item) => item.kind === "reservation")
    .sort((a, b) => (sectionRank.get(a.section) ?? 99) - (sectionRank.get(b.section) ?? 99) || a.sortOrder - b.sortOrder)
    .map((item) => fill(item.body))
    .filter(Boolean)
    .join("\n\n");

  return {
    customerText: [intro, ...rendered].filter(Boolean).join("\n\n"),
    reservations,
    sections: sections.map((section) => ({ number: section.number, key: section.key, title: section.title })),
    usedBlockKeys: chosen.map((item) => item.key),
  };
}

export function isStandardDocument(text: string): boolean {
  return text.includes("Straume Våtrom As takker for invitasjonen") || text.includes("LOV 1989-06-16 nr 63");
}
