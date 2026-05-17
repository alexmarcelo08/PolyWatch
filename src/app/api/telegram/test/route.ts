import { NextResponse } from "next/server";
import { sendUserTelegramMessage } from "@/lib/telegram";
import { formatLocal, nowIso } from "@/lib/time";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    await sendUserTelegramMessage(
      user.id,
      [
        "🚨 Polymarket Wallet Activity",
        "",
        "Wallet: Test Wallet",
        "Action: TEST NOTIFICATION",
        "Market: Telegram integration check",
        "Side: YES",
        "Amount: $0",
        "Price: 0.00",
        `Time: ${formatLocal(nowIso())}`,
      ].join("\n"),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
