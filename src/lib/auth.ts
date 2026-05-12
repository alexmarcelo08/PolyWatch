import { cookies } from "next/headers";
import { randomBytes, createHash } from "crypto";
import type { User } from "./types";
import { createSession, findSessionByToken, findUserByEmail, getUserById, removeSession } from "./storage";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "polywatch_session";
const SESSION_DAYS = 14;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function login(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await createSession(user.id, hashToken(token), expiresAt);
  return { user, token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await removeSession(hashToken(token));
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | undefined> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return undefined;
  const session = await findSessionByToken(hashToken(token));
  if (!session) return undefined;
  return getUserById(session.userId);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Admin access required");
  return user;
}
