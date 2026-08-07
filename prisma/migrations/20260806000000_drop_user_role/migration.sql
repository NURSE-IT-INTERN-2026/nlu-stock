-- Roles moved out of the database into env allowlists (src/lib/roles.ts).
ALTER TABLE "users" DROP COLUMN "role";
DROP TYPE "Role";
