import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, json, error, parseBody, getSearchParams, paginate } from "@/lib/api-utils";
import { userCreateSchema } from "@/lib/validators";
import { roleForEmail, emailsForRole, ENV_ROLES, type EnvRole } from "@/lib/roles";
import type { Prisma } from "@/generated/prisma/client";
import { NextRequest } from "next/server";

// There is no role column to filter on, so turn the requested role back into its env email
// list and match on that — the DB still does the paging. "" / "ALL" = no filter.
function roleWhere(role: string | null): Prisma.UserWhereInput {
  if (!role || role === "ALL") return {};
  // BORROWER is unfilterable by design — it has no env list to turn back into addresses.
  const emails = (ENV_ROLES as readonly string[]).includes(role) ? emailsForRole(role as EnvRole) : [];
  // equals + insensitive per address: emails are stored as typed, the env lists are lowercased.
  return { OR: emails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })) };
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(params);

  const where = roleWhere(params.get("role"));

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, skip, take, orderBy: { name: "asc" } }),
    prisma.user.count({ where }),
  ]);

  // role isn't stored — derive it from the env allowlists for display. null = the
  // account exists but no list mentions it, so it can no longer sign in.
  return json({
    users: users.map((u) => ({ ...u, role: roleForEmail(u.email) })),
    page,
    perPage,
    total,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { data, error: parseError } = await parseBody(userCreateSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return error("Email already exists");

  const user = await prisma.user.create({ data });

  return json(user, 201);
}
