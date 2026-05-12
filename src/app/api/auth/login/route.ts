import { NextResponse } from "next/server";
import { login, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user, token, expiresAt } = await login(String(body.email ?? ""), String(body.password ?? ""));
    await setSessionCookie(token, expiresAt);
    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 401 });
  }
}
