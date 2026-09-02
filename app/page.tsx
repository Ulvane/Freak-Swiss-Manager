import { TournamentManager } from "@/app/tournament-manager";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <TournamentManager
      signInPath="/auth?returnTo=%2F"
      signOutPath="/api/auth/logout?returnTo=%2F"
    />
  );
}
