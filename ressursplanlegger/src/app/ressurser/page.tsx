import Link from "next/link";
import { restoreResource } from "@/lib/actions";
import { loadInputs } from "@/lib/data";
import { formatNorwegian, todayIso } from "@/lib/dates";
import { formatHours } from "@/lib/format";
import { INNLEID_LABEL } from "@/lib/planning";

export default async function RessurserPage() {
  const { resources } = await loadInputs();
  const today = todayIso();
  const visible = resources.filter((resource) => !resource.planExcluded);
  const hidden = resources.filter((resource) => resource.planExcluded);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Ressurser</h1>
          <p className="lede">Håndverkerne som kapasiteten regnes ut fra. Standard uke er 37,5 timer, altså 7,5 timer per dag.</p>
        </div>
        <Link className="btn" href="/ressurser/ny">
          Ny ressurs
        </Link>
      </header>

      {visible.length === 0 ? (
        <section className="card empty">Ingen ressurser ennå.</section>
      ) : (
        <div className="card table-wrap">
          <table className="plain">
            <thead>
              <tr>
                <th>Navn</th>
                <th>Fag</th>
                <th>Timer/uke</th>
                <th>Fravær</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((resource) => {
                const upcoming = resource.absences
                  .map((absence) => ({
                    ...absence,
                    start: absence.startDate.toISOString().slice(0, 10),
                    end: absence.endDate.toISOString().slice(0, 10),
                  }))
                  .filter((absence) => absence.end >= today)
                  .sort((a, b) => a.start.localeCompare(b.start))[0];
                return (
                  <tr key={resource.id} className={resource.active ? undefined : "inactive"}>
                    <td>
                      <strong>{resource.name}</strong>
                      {resource.innleid ? <div className="pill innleid">{INNLEID_LABEL}</div> : null}
                      {resource.isExample ? <div className="pill example">Eksempel</div> : null}
                    </td>
                    <td>{resource.role}</td>
                    <td>{formatHours(resource.weeklyCapacityHours)}</td>
                    <td>
                      {upcoming
                        ? `${upcoming.reason} ${formatNorwegian(upcoming.start)}–${formatNorwegian(upcoming.end)}`
                        : "–"}
                    </td>
                    <td>{resource.active ? "Aktiv" : "Ikke aktiv"}</td>
                    <td>
                      <Link className="btn-secondary" href={`/ressurser/${resource.id}`}>
                        Endre
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hidden.length > 0 ? (
        <section className="panel" style={{ marginTop: "0.9rem" }}>
          <h2>Ikke med i planleggingen</h2>
          <p className="meta">Disse er skjult. Tripletex oppretter dem ikke på nytt.</p>
          {hidden.map((resource) => (
            <div className="person" key={resource.id}>
              <div>
                <strong>{resource.name}</strong>
                <div className="meta">{resource.role}</div>
              </div>
              <form action={restoreResource.bind(null, resource.id)}>
                <button className="btn-secondary" type="submit">
                  Ta med igjen
                </button>
              </form>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
