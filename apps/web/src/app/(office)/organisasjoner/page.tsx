import { listOrganizations } from "@/server/crm";
import { OrgForm } from "./form";

export default async function OrganizationsPage() {
  const orgs = await listOrganizations();
  return (
    <>
      <div className="top">
        <div>
          <h1>Organisasjoner</h1>
          <p className="muted">Borettslag, sameier og andre oppdragsgivere.</p>
        </div>
      </div>
      <div className="grid-2">
        <section className="card">
          <table>
            <thead>
              <tr>
                <th>Navn</th>
                <th>Org.nr</th>
                <th>Personer</th>
                <th>Eier</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id}>
                  <td>
                    {org.name}
                    <div className="muted">{org.address}</div>
                  </td>
                  <td>{org.orgNumber ?? "–"}</td>
                  <td>{org._count.people}</td>
                  <td>{org.owner?.name ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <OrgForm />
      </div>
    </>
  );
}
