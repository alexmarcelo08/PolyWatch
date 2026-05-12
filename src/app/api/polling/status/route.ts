import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listApiHealth, listPollingState } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ pollingState: await listPollingState(user.id), apiHealth: await listApiHealth() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 401 });
  }
}
