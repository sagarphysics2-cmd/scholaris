import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function RootNotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
        <Compass className="size-6" />
      </div>
      <p className="text-sm font-semibold text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <ButtonLink href="/dashboard" className="mt-6">
        Go to dashboard
      </ButtonLink>
    </main>
  );
}
