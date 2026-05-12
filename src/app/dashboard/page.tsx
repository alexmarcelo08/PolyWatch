import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardPayload } from "@/lib/dashboard-data";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const initialData = await getDashboardPayload(user);
  return <Dashboard initialData={initialData} />;
}
