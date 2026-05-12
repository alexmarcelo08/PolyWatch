import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { updateTelegramSettings } from "@/lib/storage";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    return NextResponse.json({ settings: await updateTelegramSettings(user.id, String(body.chatId ?? "")) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
