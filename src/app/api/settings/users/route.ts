import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, json, error, parseBody, getSearchParams, paginate } from "@/lib/api-utils";
import { userCreateSchema } from "@/lib/validators";
import { displayRole, emailsForRole, ENV_ROLES, type EnvRole } from "@/lib/roles";
import { HISTORY_RELATIONS, hasHistory } from "@/lib/user-history";
import type { Prisma } from "@/generated/prisma/client";
import { NextRequest } from "next/server";

// There is no role column to filter on, so turn the requested role back into its env email
// list and match on that — the DB still does the paging. "" / "ALL" = no filter.
function roleWhere(role: string | null): Prisma.UserWhereInput {
  if (!role || role === "ALL") return {};
  // BORROWER is the one role with no env list; it has a column instead. Exclude the listed
  // addresses so a borrower later promoted to staff shows under their new role only.
  if (role === "BORROWER") return { isBorrower: true, ...notListed() };
  const emails = (ENV_ROLES as readonly string[]).includes(role) ? emailsForRole(role as EnvRole) : [];
  // equals + insensitive per address: emails are stored as typed, the env lists are lowercased.
  return { OR: emails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })) };
}

/** Rows no env list mentions. */
function notListed(): Prisma.UserWhereInput {
  const emails = ENV_ROLES.flatMap((r) => emailsForRole(r));
  if (!emails.length) return {};
  return { NOT: { OR: emails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })) } };
}

// ชื่อ/อีเมล — 1000+ นศ. ที่เคยล็อกอินอยู่ในตารางเดียวกับเจ้าหน้าที่ 10 คน ไล่ทีละหน้าไม่ไหว
function searchWhere(q: string | null): Prisma.UserWhereInput {
  const term = q?.trim();
  if (!term) return {};
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
    ],
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(params);

  const where: Prisma.UserWhereInput = {
    AND: [roleWhere(params.get("role")), searchWhere(params.get("q"))],
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where, skip, take, orderBy: { name: "asc" },
      include: { _count: { select: HISTORY_RELATIONS } },
    }),
    prisma.user.count({ where }),
  ]);

  // role isn't a column — derive it for display. null = no env list mentions the account
  // and it never signed in as a นศ./บุคลากร, so it can no longer sign in at all.
  return json({
    users: users.map(({ _count, ...u }) => ({
      ...u,
      role: displayRole(u),
      hasHistory: hasHistory(_count),
    })),
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
