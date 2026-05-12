import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createUser, listUsers } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ users: await listUsers() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const user = await createUser(String(body.email ?? ""), String(body.password ?? ""), body.role === "admin" ? "admin" : "user");
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
