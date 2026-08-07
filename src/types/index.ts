import type { Role } from "@/lib/roles";

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  role: Role;
}
