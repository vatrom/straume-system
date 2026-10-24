import { TripletexPanel } from "@/components/tripletex-panel";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateToIso, todayIso } from "@/lib/dates";
import { readTripletexConfig } from "@/lib/tripletex/config";
import { createTripletexApi } from "@/lib/tripletex/client";
import { employmentWindow, selectCurrentEmployees } from "@/lib/tripletex/employment";
import { bestEmployeeMatch, bestProjectMatch } from "@/lib/tripletex/match";

export default async function TripletexPage() {
  await requireUser();
  const config = readTripletexConfig();
  const [resources, projects, state, unmapped] = await Promise.all([
    prisma.resource.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({ orderBy: { name: "asc" } }),
    prisma.integrationState.findUnique({ where: { id: "tripletex" } }),
    prisma.timeEntry.findMany({
      where: { source: "tripletex", unmappedReason: { not: "" } },
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);

  let employees: { id: number; firstName: string; lastName: string }[] = [];
  let remoteProjects: { id: number; number: string; name: string }[] = [];
  let catalogError = "";
  if (config.configured) {
    try {
      const api = await createTripletexApi(config);
      if (api) {
        const [staff, jobs, projectsFromTripletex] = await Promise.all([
          api.employees(),
          api.employments(),
          api.projects(),
        ]);
        const period = employmentWindow(todayIso());
        employees = selectCurrentEmployees(staff, jobs, period.from, period.to);
        remoteProjects = projectsFromTripletex.filter((project) => !project.closed && !project.internal);
      }
    } catch (error) {
      catalogError = error instanceof Error ? error.message : "Kunne ikke lese katalogen fra Tripletex.";
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Timer fra Tripletex</h1>
          <p className="lede">Henter førte timer. Appen skriver aldri tilbake til Tripletex.</p>
        </div>
      </header>
      <TripletexPanel
        configured={config.configured}
        companyId={config.companyId}
        catalogError={catalogError}
        lastSyncAt={state?.lastSyncAt ? state.lastSyncAt.toISOString() : null}
        lastSyncMessage={state?.lastSyncMessage ?? ""}
        lastSyncOk={state?.lastSyncOk ?? false}
        resources={resources.map((resource) => ({
          id: resource.id,
          name: resource.name,
          tripletexEmployeeId: resource.tripletexEmployeeId,
          suggestion: bestEmployeeMatch(resource.name, employees),
        }))}
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
          tripletexProjectId: project.tripletexProjectId,
          tripletexProjectNumber: project.tripletexProjectNumber,
          suggestion: bestProjectMatch(project.name, remoteProjects),
        }))}
        employees={employees.map((employee) => ({ id: employee.id, name: `${employee.firstName} ${employee.lastName}`.trim() }))}
        remoteProjects={remoteProjects}
        unmapped={unmapped.map((entry) => ({
          id: entry.id,
          date: dateToIso(entry.date),
          hours: entry.hours,
          employeeName: entry.employeeName,
          projectLabel: entry.projectLabel,
          reason: entry.unmappedReason,
        }))}
      />
    </>
  );
}
