import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { sql } from "./db";

export type Role = "student" | "parent" | "admin";
export type CurrentUser = {
  id: number;
  login: string;
  displayName: string;
  role: Role;
};

const COOKIE = "mt_session";
const SESSION_DAYS = 30;

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await sql`insert into sessions (token_hash, user_id, expires_at) values (${hashToken(token)}, ${userId}, ${expires})`;
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await sql`delete from sessions where token_hash = ${hashToken(token)}`;
  jar.delete(COOKIE);
}

/** The signed-in user, or null. */
export async function getUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const rows = await sql<CurrentUser[]>`
    select u.id, u.login, u.display_name as "displayName", u.role
    from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)} and s.expires_at > now()`;
  return rows[0] ?? null;
}

/** For pages: redirects to login (or the user's home) when the role does not match. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

export function homeFor(role: Role) {
  return role === "admin" ? "/admin" : role === "parent" ? "/parent" : "/student";
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** For route handlers: throws 401/403 instead of redirecting. */
export async function apiUser(...roles: Role[]): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) throw new HttpError(401, "سجّل الدخول أولاً");
  if (roles.length && !roles.includes(user.role)) throw new HttpError(403, "ليست لديك صلاحية");
  return user;
}

export function newLinkCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
