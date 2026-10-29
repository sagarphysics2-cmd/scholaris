import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-muted">
        <WifiOff className="size-6" />
      </div>
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">Check your connection — Scholaris will reload when you&apos;re back online.</p>
    </main>
  );
}
