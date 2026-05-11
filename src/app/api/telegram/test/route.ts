import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatLocal, nowIso } from "@/lib/time";

export const runtime = "nodejs";

export async function POST() {
  try {
    await sendTelegramMessage(
      [
        "🚨 <b>Polymarket Wallet Activity</b>",
        "",
        "Wallet: Test Wallet",
        "Action: <b>TEST NOTIFICATION</b>",
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
