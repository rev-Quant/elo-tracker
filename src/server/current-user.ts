import { requireSession } from "@/lib/auth/session";
import { type Queryable, db } from "@/db";
import type { User } from "@/db/schema";
import { requireUser } from "@/server/auth/service";

/** Resolve the signed-in user, rejecting sessions whose account is gone. */
export async function currentUser(conn: Queryable = db): Promise<User> {
  const session = await requireSession();
  return requireUser(session.userId, conn);
}
