import { GuestJoinPanel } from "@/app/guest/join/guest-join-panel";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ code?: string }>;
};

export default async function GuestJoinPage({ searchParams }: Props) {
  const { code } = await searchParams;
  return <GuestJoinPanel prefillCode={code || ""} />;
}
