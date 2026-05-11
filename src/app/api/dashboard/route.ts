import { NextResponse } from "next/server";
import { getPublicConfig } from "@/lib/config";
import { readDatabase } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const db = await readDatabase();
  return NextResponse.json({
    wallets: db.wallets,
    activity: db.activity.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 80),
    system: db.system,
    config: getPublicConfig(),
  });
}
