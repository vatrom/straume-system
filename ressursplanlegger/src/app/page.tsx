import Link from "next/link";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { deleteExampleData } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { getDashboard } from "@/lib/data";
import { LEVEL_LABEL, formatHours } from "@/lib/format";
import { INNLEID_LABEL } from "@/lib/planning";
import { TRIPLETEX_SETUP_LABEL } from "@/lib/tripletex/import";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ fag?: string; personell?: string }>;
}) {
  const params = await searchParams;
  const personell = params.personell === "innleid" ? "innleid" : "";
  const [data, user] = await Promise.all([getDashboard(params.fag ?? "", personell), getCurrentUser()]);
  const freePeople = data.nextWeekPeople.filter((person) => person.level === "free").length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Oversikt</h1>
          <p className="lede">
            {data.activeResources} aktive håndverkere og {data.activeProjects} prosjekter som legger beslag på tid.
          </p>
        </div>
        <div className="actions">
          <Link className="btn" href="/prosjekter/ny">
            Nytt prosjekt
          </Link>
          <Link className="btn-secondary" href="/ressurser/ny">
            Ny ressurs
          </Link>
        </div>
      </header>

      {data.exampleCount > 0 ? (
        <div className="banner">
          <p>
            <strong>Eksempeldata.</strong> Tallene under er lagt inn for å vise hvordan oversikten ser ut. Slett dem når dere
            legger inn egne folk og prosjekter.
          </p>
          {user?.role === "admin" ? (
            <form action={deleteExampleData}>
              <ConfirmSubmit
                label="Fjern eksempeldata"
                confirm="Fjerne alle ressurser og prosjekter som er merket som eksempel?"
              />
            </form>
          ) : null}
        </div>
      ) : null}

      {data.newFromTripletex.length > 0 ? (
        <section className="panel" style={{ marginBottom: "0.9rem" }}>
          <h2>{TRIPLETEX_SETUP_LABEL}</h2>
          {data.newFromTripletex.map((project) => (
            <Link key={project.id} className="overload-item" href={`/prosjekter/${project.id}`}>
              <strong>{project.name}</strong>
              <span className="meta">{TRIPLETEX_SETUP_LABEL}</span>
            </Link>
          ))}
        </section>
      ) : null}

      {data.activeResources === 0 ? (
        <section className="card">
          <h2>Kom i gang</h2>
          <p>Legg inn håndverkerne først. Deretter oppretter du prosjekter og ser hvem som har ledig tid.</p>
          <Link className="btn" href="/ressurser/ny">
            Legg inn en ressurs
          </Link>
        </section>
      ) : (
        <>
          <div className="chips">
            <Link className={!data.fag ? "chip selected" : "chip"} href="/">
              Alle fag
            </Link>
            {data.roles.map((role) => (
              <Link key={role.role} className={data.fag === role.role ? "chip selected" : "chip"} href={`/?fag=${encodeURIComponent(role.role)}`}>
                {role.role}: {formatHours(role.freeHours)} t ledig
              </Link>
            ))}
            <Link className={data.personell === "innleid" ? "chip selected" : "chip"} href={data.personell === "innleid" ? "/" : "/?personell=innleid"}>
              {INNLEID_LABEL}
            </Link>
          </div>
          {data.hiredPeople.length > 0 ? (
            <section className="panel hired-panel" style={{ marginBottom: "0.9rem" }}>
              <h2>{INNLEID_LABEL}</h2>
              <p className="meta">Mulig å sette inn. Timene deres telles ikke som ledig kapasitet i firmaet.</p>
              {data.hiredPeople.map((person) => (
                <div className="person" key={person.id}>
                  <div>
                    <strong>{person.name}</strong>
                    <div className="meta">{person.role}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className="pill innleid">{INNLEID_LABEL}</span>
                    <div className="meta">Planlagt {formatHours(person.bookedHours)} t neste uke</div>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
          <section className="stat-grid">
            <Link className="card stat-card" href="/kapasitet">
              <span>Ledige timer neste 4 uker</span>
              <div className="stat-value">{formatHours(data.freeHours)}</div>
              <p>av {formatHours(data.capacityHours)} timer kapasitet</p>
            </Link>
            <Link className="card stat-card" href="/kapasitet">
              <span>Uker med overbelastning</span>
              <div className="stat-value">{data.overloadWeeks.length}</div>
              <p>i de neste 16 ukene, der minst én person er over 100 %</p>
            </Link>
            <Link className="card stat-card" href="/kapasitet?visning=dag">
              <span>Ledig neste uke</span>
              <div className="stat-value">{freePeople}</div>
              <p>
                av {data.nextWeekPeople.length} har god ledig tid {data.nextWeekLabel}
              </p>
            </Link>
          </section>

          <section className="split">
            <div className="panel">
              <h2>Overbelastning</h2>
              {data.overloadSpans.length === 0 ? (
                <p>Ingen overbelastning de neste 16 ukene.</p>
              ) : (
                data.overloadSpans.map((span) => (
                  <a key={`${span.resourceId}-${span.label}`} className="overload-item" href={`/kapasitet?visning=dag&fra=${span.monday}${data.fag ? `&fag=${encodeURIComponent(data.fag)}` : ""}`}>
                    <strong>
                      {span.resourceName} er overbooket i {span.label}
                    </strong>
                  </a>
                ))
              )}
            </div>
            <div className="panel">
              <h2>Hvem er ledig neste uke?</h2>
              <p className="meta">{data.nextWeekLabel}</p>
              {data.nextWeekPeople.map((person) => {
                const ratio = person.capacityHours > 0 ? Math.min(1, person.bookedHours / person.capacityHours) : person.bookedHours > 0 ? 1 : 0;
                return (
                  <div className="person" key={person.id}>
                    <div>
                      <strong>{person.name}</strong>
                      <div className="meta">{person.role}</div>
                      <div className="meter" aria-hidden="true">
                        <span className={person.level} style={{ width: `${ratio * 100}%` }} />
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className={`pill ${person.level}`}>{person.note ?? LEVEL_LABEL[person.level]}</span>
                      <div className="meta">
                        {formatHours(person.freeHours)} t ledig av {formatHours(person.capacityHours)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </>
  );
}
