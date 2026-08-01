import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth/session";

export default async function HomePage() {
  if (await getSession()) redirect("/groups");

  return (
    <main>
      <div className="mb-8 mt-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Who&apos;s actually winning?</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
          Track ratings across every game your group plays. Settle it with data.
        </p>
      </div>

      <Card>
        <AuthForm />
      </Card>
    </main>
  );
}
