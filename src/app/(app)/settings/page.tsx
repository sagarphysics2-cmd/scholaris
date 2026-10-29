import type { Metadata } from "next";
import { Building2, CalendarCheck2, Globe2, GraduationCap, KeyRound, Mail, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { sp } from "@/components/ui/pagination";
import { LinkTabs } from "@/components/ui/tabs";
import { can, requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { getSchoolSettingsBundle, listRoles } from "@/server/services/settings.service";
import { AttendanceForm, FeesForm, GeneralForm, GradingForm, NotificationsForm, ProfileForm, RoleForm } from "./forms";
import { ActionFormRolePicker } from "./role-picker";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("settings.manage");
  const params = await searchParams;
  const { school, settings, grades } = await getSchoolSettingsBundle(actor);
  const canRoles = can(actor, "roles.manage");
  const requested = sp(params, "tab") ?? "school";
  const tab = requested === "roles" && !canRoles ? "school" : requested;
  const tabs = [
    { key: "school", label: "School", href: "/settings" },
    { key: "academic", label: "Grading", href: "/settings?tab=academic" },
    { key: "attendance", label: "Attendance", href: "/settings?tab=attendance" },
    { key: "fees", label: "Fees", href: "/settings?tab=fees" },
    { key: "notifications", label: "Notifications", href: "/settings?tab=notifications" },
    ...(canRoles ? [{ key: "roles", label: "Roles & permissions", href: "/settings?tab=roles" }] : []),
  ];

  return (
    <>
      <PageHeader title="Settings" description={`Configuration for ${school.name}. Classes, sections and subjects are managed from their own pages.`} />
      <LinkTabs tabs={tabs} active={tab} />
      {tab === "school" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card><CardHeader title="School profile" icon={<Building2 />} description="Shown on report cards, receipts and emails." /><CardContent><ProfileForm school={school} /></CardContent></Card>
          <Card><CardHeader title="General" icon={<Globe2 />} description="Currency, time zone and the school week." /><CardContent><GeneralForm settings={settings} /></CardContent></Card>
        </div>
      )}
      {tab === "academic" && <Card className="max-w-3xl"><CardHeader title="Grading rules" icon={<GraduationCap />} description="Grades are assigned from the percentage scored." /><CardContent><GradingForm grades={grades} overallPassPercent={settings.exams.overallPassPercent} /></CardContent></Card>}
      {tab === "attendance" && <Card className="max-w-3xl"><CardHeader title="Attendance" icon={<CalendarCheck2 />} /><CardContent><AttendanceForm settings={settings.attendance} /></CardContent></Card>}
      {tab === "fees" && <Card className="max-w-3xl"><CardHeader title="Fees" icon={<Wallet />} /><CardContent><FeesForm settings={settings.fees} /></CardContent></Card>}
      {tab === "notifications" && <Card className="max-w-3xl"><CardHeader title="Email notifications" icon={<Mail />} /><CardContent><NotificationsForm settings={settings.notifications} /></CardContent></Card>}
      {tab === "roles" && canRoles && <RolesTab requested={sp(params, "role")} actorPromise={listRoles(actor)} />}
    </>
  );
}

async function RolesTab({ requested, actorPromise }: { requested?: string; actorPromise: ReturnType<typeof listRoles> }) {
  const [roles, permissions] = await Promise.all([actorPromise, db.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] })]);
  const role = roles.find((r) => r.id === requested) ?? roles.find((r) => r.key === "TEACHER") ?? roles[0]!;
  return (
    <Card>
      <CardHeader title="Roles & permissions" icon={<KeyRound />} description="Permissions are stored in the database and checked on every server request. Row-level rules (e.g. teachers only see their own classes) always apply on top." action={<ActionFormRolePicker roles={roles.map((r) => ({ id: r.id, name: `${r.name} (${r._count.users})` }))} active={role.id} />} />
      <CardContent>
        <RoleForm key={role.id} role={{ id: role.id, key: role.key, granted: role.permissions.map((p) => p.permission.key) }} permissions={permissions} />
      </CardContent>
    </Card>
  );
}
