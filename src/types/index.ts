export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  role: "ADMIN" | "STAFF" | "INSTRUCTOR";
}
