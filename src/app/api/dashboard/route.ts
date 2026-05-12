import { NextResponse } from "next/server";
import { getPublicConfig } from "@/lib/config";
import { requireUser } from "@/lib/auth";
import { getRiskSettings, getTelegramSettings, listApiHealth, listCopyIntents, listPollingState, listWallets, readDatabase, recentActivity } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const db = await readDatabase();
    const wallets = await listWallets(user.id);
    return NextResponse.json({
      user: { id: user.id, email: user.email, role: user.role },
      wallets,
      activity: await recentActivity(user.id, 80),
      copySettings: db.copySettings.filter((settings) => settings.userId === user.id),
      copyTradeIntents: await listCopyIntents(user.id, 120),
      positions: db.positions.filter((position) => position.userId === user.id),
      pollingState: await listPollingState(user.id),
      apiHealth: await listApiHealth(80),
      telegramSettings: await getTelegramSettings(user.id),
      riskSettings: await getRiskSettings(user.id),
      system: db.system,
      config: getPublicConfig(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 401 });
  }
}
