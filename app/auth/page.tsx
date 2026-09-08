import { AuthPanel } from "@/app/auth/auth-panel";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function AuthPage({ searchParams }: Props) {
  const { returnTo } = await searchParams;
  return <AuthPanel returnTo={returnTo || "/"} />;
}
