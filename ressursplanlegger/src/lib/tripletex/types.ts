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
};

export type TripletexProject = {
  id: number;
  number: string;
  name: string;
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
  weekYear: string;
  completed: boolean;
};

export type SessionRequest = {
  url: string;
  method: "POST";
  body: Record<string, string | number>;
};
