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
  emptyEmploymentSearch: {
    fullResultSize: 0,
    from: 0,
    count: 1000,
    values: [],
  },
  /**
   * Real shape: employments are nested on Employee and have no employee id of their own.
   * The unfiltered /employee/employment search is a separate, empty list.
   */
  employeesWithEmployments: {
    fullResultSize: 6,
    from: 0,
    count: 1000,
    values: [
      {
        id: 1,
        firstName: "Kari",
        lastName: "Haugen",
        isContact: false,
        isProxy: false,
        allowInformationRegistration: false,
        employments: [{ id: 101, startDate: "2019-04-01", endDate: null, noEmploymentRelationship: false }],
      },
      {
        id: 2,
        firstName: "Sluttet",
        lastName: "I fjor",
        isContact: false,
        isProxy: false,
        allowInformationRegistration: true,
        employments: [{ id: 102, startDate: "2010-01-01", endDate: "2024-05-31", noEmploymentRelationship: false }],
      },
      {
        id: 3,
        firstName: "Per",
        lastName: "Kontakt",
        isContact: true,
        isProxy: false,
        employments: [{ id: 103, startDate: "2020-01-01", endDate: null, noEmploymentRelationship: false }],
      },
      {
        id: 4,
        firstName: "Regnskap",
        lastName: "Kontor",
        isContact: false,
        isProxy: true,
        employments: [{ id: 104, startDate: "2020-01-01", endDate: null, noEmploymentRelationship: false }],
      },
      {
        id: 5,
        firstName: "Pensjon",
        lastName: "Uten",
        isContact: false,
        isProxy: false,
        employments: [{ id: 105, startDate: "2020-01-01", endDate: null, noEmploymentRelationship: true }],
      },
      {
        id: 6,
        firstName: "Ny",
        lastName: "I morgen",
        isContact: false,
        isProxy: false,
        employments: [{ id: 106, startDate: "2026-10-25", endDate: null, noEmploymentRelationship: false }],
      },
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
