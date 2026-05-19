import { SigningClient } from "@/components/sign/signing-client";
import { SigningPageShell } from "@/components/sign/signing-page-shell";

type SigningPageProps = {
  params: Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export default async function SigningPage({ params }: SigningPageProps) {
  const { token } = await params;

  return (
    <SigningPageShell>
      <SigningClient token={token} />
    </SigningPageShell>
  );
}
