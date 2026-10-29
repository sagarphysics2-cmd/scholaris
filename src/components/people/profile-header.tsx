import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

export function ProfileHeader({
  name,
  avatarFileId,
  subtitle,
  badges,
  meta,
  actions,
}: {
  name: string;
  avatarFileId?: string | null;
  subtitle?: ReactNode;
  badges?: ReactNode;
  meta?: Array<{ icon: ReactNode; label: ReactNode }>;
  actions?: ReactNode;
}) {
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="h-20 bg-gradient-to-r from-primary/80 via-primary/60 to-chart-2/60 sm:h-24" aria-hidden />
      <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          <Avatar name={name} fileId={avatarFileId} size="xl" className="-mt-12 ring-4" />
          <div className="min-w-0 sm:pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{name}</h1>
              {badges}
            </div>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            {meta && meta.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {meta.map((m, i) => (
                  <li key={i} className="flex items-center gap-1.5 [&_svg]:size-4">
                    {m.icon}
                    {m.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
      </div>
    </Card>
  );
}
