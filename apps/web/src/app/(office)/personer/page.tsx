import { listOptions, listOrganizations, listPeople, staff } from "@/server/crm";
import { PersonForm } from "./form";

export default async function PeoplePage() {
  const [people, orgs, users, options] = await Promise.all([listPeople(), listOrganizations(), staff(), listOptions()]);
  const labels = options.find((list) => list.key === "person_etikett")?.items.filter((item) => item.active) ?? [];
  return (
    <>
      <div className="top">
        <div>
          <h1>Personer</h1>
          <p className="muted">Kunder og kontakter. Eksemplene er fiktive.</p>
        </div>
      </div>
      <div className="grid-2">
        <section className="card">
          <table>
            <thead>
              <tr>
                <th>Navn</th>
                <th>Kontakt</th>
                <th>Etikett</th>
                <th>Eier</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td>
                    {person.firstName} {person.lastName}
                    <div className="muted">{person.organization?.name ?? [person.street, person.houseNumber, person.city].filter(Boolean).join(" ")}</div>
                  </td>
                  <td>
                    {person.phone}
                    <div className="muted">{person.email}</div>
                  </td>
                  <td>{person.label ?? "–"}</td>
                  <td>{person.owner?.name ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <PersonForm
          organizations={orgs.map((org) => ({ id: org.id, name: org.name }))}
          users={users}
          labels={labels.map((item) => item.label)}
        />
      </div>
    </>
  );
}
