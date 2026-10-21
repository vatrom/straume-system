export const tripletexFixture = {
  employees: [
    { id: 10, firstName: "Kari", lastName: "Haugen", isContact: false },
    { id: 12, firstName: "Ole", lastName: "Nilsen", isContact: false },
    { id: 11, firstName: "Per", lastName: "Kontakt", isContact: true },
  ],
  projects: [
    { id: 200, number: "1042", name: "Tilbygg Strandveien" },
    { id: 201, number: "1099", name: "Ukjent bygg" },
  ],
  entries: [
    {
      id: 501,
      date: "2026-10-20",
      hours: 7.5,
      comment: "Kledning",
      employee: { id: 10, firstName: "Kari", lastName: "Haugen" },
      project: { id: 200, number: "1042", name: "Tilbygg Strandveien" },
      activity: { name: "Timer fastpris" },
    },
    {
      id: 502,
      date: "2026-10-21",
      hours: 4,
      comment: "Uten kobling",
      employee: { id: 99, firstName: "Ukjent", lastName: "Person" },
      project: { id: 201, number: "1099", name: "Ukjent bygg" },
      activity: { name: "Timer fastpris" },
    },
  ],
  weeks: [{ employee: { id: 10 }, weekYear: "2026-43", completed: false }],
};
