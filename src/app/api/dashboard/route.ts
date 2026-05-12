import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDashboardPayload } from "@/lib/dashboard-data";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await getDashboardPayload(user));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 401 });
  }
}
