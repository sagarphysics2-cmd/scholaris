import type { Metadata } from "next";
import { KeyRound, Laptop, LogOut, Smartphone, Trash2, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { DescriptionList } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { requireActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { formatDateTime, relativeTime } from "@/lib/utils";
import { listOwnSessions } from "@/server/services/profile.service";
import { removeAvatarAction, revokeOthersAction, revokeSessionAction } from "./actions";
import { AvatarForm, ContactForm, PasswordForm } from "./forms";

export const metadata: Metadata = { title: "My profile" };

function device(ua: string | null) {
  if (!ua) return { label: "Unknown device", mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) && !mobile ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return { label: `${browser}${os ? ` on ${os}` : ""}`, mobile };
}

export default async function ProfilePage() {
  const actor = await requireActor();
  const [user, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actor.userId }, include: { school: { select: { name: true } } } }),
    listOwnSessions(actor),
  ]);
  const name = `${user.firstName} ${user.lastName}`;
  return (
    <>
      <PageHeader title="My profile" description="Your account, photo, password and signed-in devices." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Account" icon={<UserRound />} />
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar name={name} fileId={user.avatarFileId} size="xl" />
              <div>
                <p className="text-lg font-semibold">{name}</p>
                <p className="text-sm text-muted-foreground">{actor.roleName}{user.school ? ` · ${user.school.name}` : ""}</p>
                {user.avatarFileId && <div className="mt-2"><ConfirmAction action={removeAvatarAction} size="sm" variant="ghost" icon={<Trash2 />} label="Remove photo" title="Remove profile photo?" description="Your initials will be shown instead." confirmLabel="Remove" /></div>}
              </div>
            </div>
            <AvatarForm />
            <DescriptionList items={[{ label: "Email", value: user.email ?? "—" }, { label: "Last sign-in", value: formatDateTime(user.lastLoginAt) }, { label: "Member since", value: formatDateTime(user.createdAt) }]} />
            <ContactForm phone={user.phone} />
            <p className="text-xs text-muted-foreground">To change your name or email, contact your school administrator.</p>
          </CardContent>
        </Card>
        <div id="security" className="space-y-6">
          <Card>
            <CardHeader title="Change password" icon={<KeyRound />} />
            <CardContent><PasswordForm /></CardContent>
          </Card>
          <Card>
            <CardHeader
              title="Signed-in devices"
              description={`${sessions.length} active session${sessions.length === 1 ? "" : "s"}`}
              action={sessions.length > 1 && <ConfirmAction action={revokeOthersAction} size="sm" icon={<LogOut />} label="Sign out others" title="Sign out all other devices?" description="Every session except this one will end." confirmLabel="Sign out others" />}
            />
            <ul className="divide-y">
              {sessions.map((s) => {
                const d = device(s.userAgent);
                const current = s.id === actor.sessionId;
                return (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-muted">{d.mobile ? <Smartphone className="size-4" /> : <Laptop className="size-4" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">{d.label}{current && <Badge tone="success">This device</Badge>}</span>
                      <span className="block text-xs text-muted-foreground">{s.ipAddress ?? "Unknown IP"} · active {relativeTime(s.lastSeenAt)}</span>
                    </span>
                    {!current && <ConfirmAction action={revokeSessionAction.bind(null, s.id)} size="sm" variant="ghost" label="Sign out" title="Sign out this device?" description={d.label} confirmLabel="Sign out" />}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
