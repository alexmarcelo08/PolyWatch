import { NextResponse } from "next/server";
import { addWallet, listWallets } from "@/lib/storage";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json(await listWallets(user.id));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await requireUser();
    const wallet = await addWallet(user.id, String(body.label ?? ""), String(body.address ?? ""));
    return NextResponse.json(wallet, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
