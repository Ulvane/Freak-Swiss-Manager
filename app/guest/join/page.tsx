import { GuestJoinPanel } from "@/app/guest/join/guest-join-panel";
import { checkServerBan } from "@/lib/anti-abuse";
import { BannedScreen } from "@/components/banned-screen";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ code?: string }>;
};

export default async function GuestJoinPage({ searchParams }: Props) {
  const ban = await checkServerBan();
  if (ban?.banned) {
    return <BannedScreen telemetry={ban.telemetry} />;
  }

  const { code } = await searchParams;
  return <GuestJoinPanel prefillCode={code || ""} />;
}
