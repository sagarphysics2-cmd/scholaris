"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-6" />
      </div>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn&apos;t load this page. This has been logged{error.digest ? ` (reference ${error.digest})` : ""}. Please try again.
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>
          <RotateCcw /> Try again
        </Button>
        <ButtonLink href="/dashboard" variant="outline">
          Go to dashboard
        </ButtonLink>
      </div>
    </div>
  );
}
