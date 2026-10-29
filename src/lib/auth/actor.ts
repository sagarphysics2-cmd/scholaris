import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { buildActor } from "@/server/authz/build-actor";
import { UnauthorizedError } from "@/server/errors";
import { can, canAny, type Actor } from "@/server/authz/guards";
import { SCHOOL_COOKIE, getSessionToken, validateSessionToken } from "./session";

async function loadActor(): Promise<Actor | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const session = await validateSessionToken(token);
  if (!session) return null;
  const chosenSchool = (await cookies()).get(SCHOOL_COOKIE)?.value ?? null;
  return buildActor(session.userId, session.id, chosenSchool);
}

/** Per-request memoised actor lookup. */
export const getActor = cache(loadActor);

/** For pages/layouts: redirects to login when there is no valid session. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireActorOrThrow(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new UnauthorizedError();
  return actor;
}

/** For pages: renders the 403 page when a permission is missing. */
export async function requirePermission(...perms: PermissionKey[]): Promise<Actor> {
  const actor = await requireActor();
  if (!can(actor, ...perms)) redirect("/forbidden");
  return actor;
}

export async function requireAnyPermission(...perms: PermissionKey[]): Promise<Actor> {
  const actor = await requireActor();
  if (!canAny(actor, ...perms)) redirect("/forbidden");
  return actor;
}


export { can, canAny, assertCan, assertCanAny, requireSchoolId, isAdmin } from "@/server/authz/guards";
export type { Actor } from "@/server/authz/guards";
