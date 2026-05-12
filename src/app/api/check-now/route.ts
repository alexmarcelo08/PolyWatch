import { NextResponse } from "next/server";
import { checkAllWallets } from "@/lib/tracker";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    const results = await checkAllWallets(user.id, true);
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
