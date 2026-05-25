export interface SessionUser {
  userId: string;
  email: string;
  role: "ADMIN" | "STAFF" | "INSTRUCTOR";
}
