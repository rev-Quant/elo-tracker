import Link from "next/link";
import { PageTitle } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="pt-20 text-center">
      <p className="text-5xl font-extrabold text-muted-dim">404</p>
      <PageTitle sub="This page doesn't exist. The page you're looking for may have been moved or deleted.">Nothing here</PageTitle>
      <Link href="/" className="text-sm font-medium text-accent hover:underline">Go home</Link>
    </main>
  );
}