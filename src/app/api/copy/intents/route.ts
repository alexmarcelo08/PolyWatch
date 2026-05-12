import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listCopyIntents } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ intents: await listCopyIntents(user.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 401 });
  }
}
