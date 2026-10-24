import Link from "next/link";
import { CapacityBoard } from "@/components/capacity-board";
import { getCapacityView } from "@/lib/data";
import { addDays, formatNorwegian } from "@/lib/dates";
import { INNLEID_LABEL } from "@/lib/planning";

function href(options: {
  mode?: "uke" | "dag";
  fra?: string;
  antall?: number;
  fag?: string;
  tilbud?: boolean;
  personell?: "" | "innleid";
}) {
  const params = new URLSearchParams();
  if (options.mode === "dag") params.set("visning", "dag");
  if (options.fra) params.set("fra", options.fra);
  if (options.antall && options.antall !== 16) params.set("antall", String(options.antall));
  if (options.fag) params.set("fag", options.fag);
  if (options.personell === "innleid") params.set("personell", "innleid");
  if (options.tilbud === false) params.set("tilbud", "av");
  const query = params.toString();
  return query ? `/kapasitet?${query}` : "/kapasitet";
}

export default async function KapasitetPage({
  searchParams,
}: {
  searchParams: Promise<{ visning?: string; fra?: string; antall?: string; fag?: string; tilbud?: string; personell?: string }>;
}) {
  const params = await searchParams;
  const view = await getCapacityView(params);
  const shift = view.mode === "dag" ? 7 : 28;
  const counts = [12, 16, 26] as const;
  const filter = { fag: view.fag, tilbud: view.showTentative, personell: view.personell };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Kapasitet</h1>
          <p className="lede">
            Grønt er ledig, gult er nesten fullt (80–100 %) og rødt er over 100 %. Uketallene er summen av
            arbeidsdagene. Helg telles ikke.
          </p>
        </div>
      </header>

      <div className="toolbar">
        <div className="segment" role="tablist" aria-label="Visning">
          <Link className={view.mode === "uke" ? "active" : undefined} href={href({ fra: view.from, antall: view.weekCount, ...filter })}>
            Uke
          </Link>
          <Link className={view.mode === "dag" ? "active" : undefined} href={href({ mode: "dag", fra: view.from, ...filter })}>
            Dag
          </Link>
        </div>
        <Link className="btn-secondary" href={href({ mode: view.mode, fra: addDays(view.from, -shift), antall: view.weekCount, ...filter })}>
          Forrige
        </Link>
        <Link className="btn-secondary" href={href({ mode: view.mode, antall: view.weekCount, ...filter })}>
          I dag
        </Link>
        <Link className="btn-secondary" href={href({ mode: view.mode, fra: addDays(view.from, shift), antall: view.weekCount, ...filter })}>
          Neste
        </Link>
        {view.mode === "uke"
          ? counts.map((count) => (
              <Link
                key={count}
                className={count === view.weekCount ? "btn" : "btn-secondary"}
                href={href({ fra: view.from, antall: count, ...filter })}
              >
                {count} uker
              </Link>
            ))
          : null}
        <Link className="btn-secondary" href={href({ mode: view.mode, fra: view.from, antall: view.weekCount, fag: view.fag, personell: view.personell, tilbud: !view.showTentative })}>
          {view.showTentative ? "Skjul tilbud" : "Vis tilbud"}
        </Link>
      </div>

      <div className="chips" style={{ marginBottom: "0.8rem" }}>
        <Link className={!view.fag && !view.personell ? "chip selected" : "chip"} href={href({ mode: view.mode, fra: view.from, antall: view.weekCount, tilbud: view.showTentative })}>
          Alle fag
        </Link>
        {view.roleNames.map((role) => (
          <Link
            key={role}
            className={view.fag === role ? "chip selected" : "chip"}
            href={href({ mode: view.mode, fra: view.from, antall: view.weekCount, fag: role, tilbud: view.showTentative })}
          >
            {role}
          </Link>
        ))}
        <Link
          className={view.personell === "innleid" ? "chip selected" : "chip"}
          href={href({
            mode: view.mode,
            fra: view.from,
            antall: view.weekCount,
            tilbud: view.showTentative,
            personell: view.personell === "innleid" ? "" : "innleid",
          })}
        >
          {INNLEID_LABEL}
        </Link>
      </div>

      <div className="legend">
        <span>
          <i className="free" /> Ledig kapasitet
        </span>
        <span>
          <i className="tight" /> Nesten full, 80–100 %
        </span>
        <span>
          <i className="over" /> Overbelastet, over 100 %
        </span>
        <span>
          <i className="off" /> Fravær eller helligdag
        </span>
        <span>
          <i className="possible" /> {INNLEID_LABEL}
        </span>
        <span>
          {formatNorwegian(view.from)}–{formatNorwegian(view.to)}
        </span>
      </div>

      {view.mode === "dag" ? (
        <p className="hint" style={{ marginTop: 0 }}>
          Dagvisning viser mandag–fredag i fire uker. En prikk i ukevisningen betyr at en enkelt dag er overbelastet selv om
          uken sett under ett ikke er rød.
          {view.holidays.length > 0
            ? ` Helligdager i perioden: ${view.holidays.map((holiday) => `${formatNorwegian(holiday.date)} ${holiday.name}`).join(", ")}.`
            : " Ingen norske helligdager på hverdager i denne perioden."}
        </p>
      ) : (
        <p className="hint" style={{ marginTop: 0 }}>
          Klikk en rute for å se hvilke prosjekter som utgjør timene. Klikk ukenummeret for å se dagene.
          {view.holidays.length > 0
            ? ` Helligdager som senker kapasiteten: ${view.holidays.map((holiday) => `${formatNorwegian(holiday.date)} ${holiday.name}`).join(", ")}.`
            : ""}
        </p>
      )}

      {view.warnings.length > 0 ? (
        <div className="banner">
          <div>
            {view.warnings.slice(0, 4).map((warning) => (
              <p key={`${warning.projectId}-${warning.message}`}>
                <strong>{warning.projectName}.</strong> {warning.message}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <CapacityBoard
        mode={view.mode}
        resources={view.resources.map((resource) => ({
          id: resource.id,
          name: resource.name,
          role: resource.role,
          innleid: Boolean(resource.innleid),
        }))}
        directory={view.everyone.map((resource) => ({
          id: resource.id,
          name: resource.name,
          role: resource.role,
          innleid: Boolean(resource.innleid),
        }))}
        groups={view.groups}
        rows={view.rows}
        totals={view.totals}
        dayRows={view.dayRows.map((row) => ({ resourceId: row.resource.id, days: row.days }))}
        gantt={view.gantt}
      />
    </>
  );
}
