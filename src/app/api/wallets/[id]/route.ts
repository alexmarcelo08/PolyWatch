import { NextResponse } from "next/server";
import { deleteWallet, updateWallet } from "@/lib/storage";
import type { WalletStatus } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const wallet = await updateWallet(id, {
      label: body.label,
      address: body.address,
      status: body.status as WalletStatus | undefined,
    });
    return NextResponse.json(wallet);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Params) {
  try {
    const { id } = await context.params;
    await deleteWallet(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
