import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getWallet, patchCopySettings } from "@/lib/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const wallet = await getWallet(user.id, id);
    if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    const body = await request.json();
    const settings = await patchCopySettings(user.id, id, body);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
