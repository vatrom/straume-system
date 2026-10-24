import { LoginForm } from "@/components/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ neste?: string }> }) {
  const params = await searchParams;
  return (
    <div className="login-wrap">
      <LoginForm next={params.neste} />
    </div>
  );
}
