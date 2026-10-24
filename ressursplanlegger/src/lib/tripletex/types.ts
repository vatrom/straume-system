export type TripletexConfig = {
  baseUrl: string;
  refreshToken: string;
  consumerToken: string;
  employeeToken: string;
  companyId: string;
  username: string;
  configured: boolean;
  mode: "refresh" | "consumer";
};

export type TripletexEmployee = {
  id: number;
  firstName: string;
  lastName: string;
  isContact: boolean;
  isProxy?: boolean;
  /** Read from Tripletex. Employment overlap decides who is imported, not this flag. */
  allowInformationRegistration?: boolean | null;
};

export type TripletexEmployment = {
  employeeId: number;
  startDate: string | null;
  endDate: string | null;
  noEmploymentRelationship: boolean;
};

export type TripletexProject = {
  id: number;
  number: string;
  name: string;
  customer: string;
  startDate: string | null;
  endDate: string | null;
  closed: boolean;
  internal?: boolean;
};

export type TripletexEntry = {
  id: number;
  date: string;
  hours: number;
  comment: string;
  employeeId: number;
  employeeName: string;
  projectId: number | null;
  projectNumber: string;
  projectName: string;
  activityName: string;
};

export type TripletexWeek = {
  employeeId: number;
  /** Rebuilt from WeekDTO `year` and `week`. The DTO has no weekYear field. */
  weekYear: string;
  year: number | null;
  week: number | null;
  completed: boolean;
};

export type SessionRequest = {
  url: string;
  method: "POST";
  body: Record<string, string | number>;
};
