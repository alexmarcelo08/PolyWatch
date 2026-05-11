import { NextResponse } from "next/server";
import { checkAllWallets } from "@/lib/tracker";

export const runtime = "nodejs";

export async function POST() {
  try {
    const results = await checkAllWallets(true);
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
