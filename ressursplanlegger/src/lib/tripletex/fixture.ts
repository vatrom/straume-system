export const tripletexFixture = {
  employees: [
    { id: 10, firstName: "Kari", lastName: "Haugen", isContact: false },
    { id: 12, firstName: "Ole", lastName: "Nilsen", isContact: false },
    { id: 11, firstName: "Per", lastName: "Kontakt", isContact: true },
  ],
  projects: [
    {
      id: 200,
      number: "1042",
      name: "Tilbygg Strandveien",
      customer: { name: "Familien Berg" },
      startDate: "2026-10-19",
      endDate: "2026-12-01",
      isClosed: false,
    },
    { id: 201, number: "1099", name: "Ukjent bygg", customerName: "Ukjent", startDate: "2026-11-01", isClosed: false },
    { id: 202, number: "1001", name: "Gammelt naust", isClosed: true },
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
  weeks: [{ employee: { id: 10 }, year: 2026, week: 43, completed: false }],
};

/** Shapes returned by Tripletex list endpoints, including WeekDTO year/week. */
export const realisticTripletex = {
  weekList: {
    fullResultSize: 1,
    from: 0,
    count: 1000,
    versionDigest: "ignored",
    values: [{ id: 900, version: 1, employee: { id: 10 }, year: 2026, week: 43, completed: false }],
  },
  employmentList: {
    fullResultSize: 2,
    from: 0,
    count: 1000,
    values: [
      { id: 1, employee: { id: 10 }, startDate: "2019-04-01", endDate: null, noEmploymentRelationship: false },
      { id: 2, employee: { id: 12 }, startDate: "2015-01-01", endDate: "2024-05-31", noEmploymentRelationship: false },
    ],
  },
  weekError: {
    status: 400,
    code: 4000,
    message: "Validering feilet",
    developerMessage: "Illegal field in fields filter: weekYear (WeekDTO)",
    validationMessages: [{ field: "fields", message: "Illegal field in fields filter: weekYear" }],
  },
};
