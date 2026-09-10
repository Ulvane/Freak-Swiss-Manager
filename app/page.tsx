import { TournamentManager } from "@/app/tournament-manager";
import { checkServerBan } from "@/lib/anti-abuse";
import { BannedScreen } from "@/components/banned-screen";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ban = await checkServerBan();
  if (ban?.banned) {
    return <BannedScreen telemetry={ban.telemetry} />;
  }

  return (
    <TournamentManager
      signInPath="/auth?returnTo=%2F"
      signOutPath="/api/auth/logout?returnTo=%2F"
    />
  );
}
