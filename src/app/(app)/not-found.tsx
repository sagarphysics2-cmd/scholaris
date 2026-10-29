import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-6" />
      </div>
      <h1 className="text-xl font-semibold">We couldn&apos;t find that</h1>
      <p className="mt-2 text-sm text-muted-foreground">The record may have been removed, or you may not have access to it.</p>
      <ButtonLink href="/dashboard" className="mt-6">
        Back to dashboard
      </ButtonLink>
    </div>
  );
}
