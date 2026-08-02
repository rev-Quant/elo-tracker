import { Skeleton } from "@/components/ui";

export default function GroupLoading() {
  return (
    <main>
      <header className="mb-6">
        <Skeleton className="mb-2 h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </header>

      <div className="mb-5 flex gap-2">
        <Skeleton className="h-11 w-28 rounded-lg" />
        <Skeleton className="h-11 w-32 rounded-lg" />
      </div>

      <div className="mb-5 flex gap-3">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-14" />
      </div>

      <div className="rounded-xl border border-border bg-surface p-0">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-3 w-32" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <Skeleton className="h-4 w-6" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-1 w-20" />
            </div>
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <Skeleton className="h-3 w-28" />
        <div className="rounded-xl border border-border bg-surface p-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
