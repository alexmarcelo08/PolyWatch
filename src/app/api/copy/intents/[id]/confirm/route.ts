import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { confirmIntent } from "@/lib/copy-trading";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Params) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    return NextResponse.json({ intent: await confirmIntent(user.id, id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
