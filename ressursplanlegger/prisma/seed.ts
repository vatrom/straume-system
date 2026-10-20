import { prisma } from "../src/lib/db";
import { addDays, isoToDate, mondayOf, todayIso } from "../src/lib/dates";

async function main() {
  const existing = await prisma.resource.count();
  if (existing > 0) {
    console.log("Databasen har allerede data. Hopper over eksempeldata.");
    return;
  }

  const monday = mondayOf(todayIso());
  const on = (offset: number) => isoToDate(addDays(monday, offset));

  const kari = await prisma.resource.create({
    data: { name: "Kari Haugen", role: "Tømrer", weeklyCapacityHours: 37.5, isExample: true },
  });
  const ole = await prisma.resource.create({
    data: { name: "Ole Nilsen", role: "Tømrer", weeklyCapacityHours: 37.5, isExample: true },
  });
  const mari = await prisma.resource.create({
    data: { name: "Mari Solberg", role: "Betongarbeider", weeklyCapacityHours: 37.5, isExample: true },
  });
  const jonas = await prisma.resource.create({
    data: { name: "Jonas Berg", role: "Betongarbeider", weeklyCapacityHours: 37.5, isExample: true },
  });
  const emil = await prisma.resource.create({
    data: { name: "Emil Hansen", role: "Lærling", weeklyCapacityHours: 30, isExample: true },
  });
  const ingrid = await prisma.resource.create({
    data: { name: "Ingrid Dahl", role: "Bas", weeklyCapacityHours: 37.5, isExample: true },
  });

  await prisma.absence.create({
    data: {
      resourceId: ingrid.id,
      startDate: on(7),
      endDate: on(11),
      reason: "Ferie",
    },
  });

  await prisma.project.create({
    data: {
      name: "Tilbygg Strandveien 12",
      customer: "Familien Berg",
      address: "Strandveien 12",
      startDate: on(0),
      estimatedHours: 180,
      status: "pågår",
      color: "#1f6b4a",
      isExample: true,
      assignments: { create: [{ resourceId: kari.id }, { resourceId: ole.id }] },
    },
  });

  await prisma.project.create({
    data: {
      name: "Rehabilitering Naustet",
      customer: "Naustet Sameie",
      address: "Naustveien 4",
      startDate: on(7),
      endDate: on(25),
      estimatedHours: 200,
      status: "planlagt",
      color: "#8c3d4e",
      isExample: true,
      assignments: { create: [{ resourceId: kari.id }, { resourceId: ingrid.id }] },
    },
  });

  await prisma.project.create({
    data: {
      name: "Grunnmur Holmen",
      customer: "Holmen Eiendom",
      address: "Holmen 8",
      startDate: on(14),
      endDate: on(53),
      estimatedHours: 520,
      status: "planlagt",
      color: "#2f5d8c",
      isExample: true,
      assignments: {
        create: [{ resourceId: mari.id }, { resourceId: jonas.id }, { resourceId: emil.id }],
      },
    },
  });

  await prisma.project.create({
    data: {
      name: "Garasje Øvre vei",
      customer: "Olav Hauge",
      address: "Øvre vei 4",
      startDate: on(28),
      estimatedHours: 60,
      status: "planlagt",
      color: "#c47b2b",
      isExample: true,
      assignments: { create: [{ resourceId: ole.id }] },
    },
  });

  await prisma.project.create({
    data: {
      name: "Støttemur Bryggen",
      customer: "Bryggen Eiendom",
      address: "Bryggen 2",
      startDate: on(-40),
      endDate: on(-22),
      estimatedHours: 90,
      status: "ferdig",
      color: "#5c6b2f",
      isExample: true,
      assignments: { create: [{ resourceId: jonas.id }] },
    },
  });

  console.log("La inn eksempeldata fra og med", monday);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
