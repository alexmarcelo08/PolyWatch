import { NextResponse } from "next/server";
import { addWallet, listWallets } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listWallets());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const wallet = await addWallet(String(body.label ?? ""), String(body.address ?? ""));
    return NextResponse.json(wallet, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
