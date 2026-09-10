import { AuthPanel } from "@/app/auth/auth-panel";
import { safeReturnPath } from "@/lib/safe-return-path";
import { checkServerBan } from "@/lib/anti-abuse";
import { BannedScreen } from "@/components/banned-screen";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function AuthPage({ searchParams }: Props) {
  const ban = await checkServerBan();
  if (ban?.banned) {
    return <BannedScreen telemetry={ban.telemetry} />;
  }

  const { returnTo } = await searchParams;
  return <AuthPanel returnTo={safeReturnPath(returnTo)} />;
}
