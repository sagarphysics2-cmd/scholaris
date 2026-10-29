import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { bottomNav, buildNav } from "@/lib/navigation";
import { logoutAction } from "../(auth)/actions";
import { switchSchoolAction } from "./shell-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const [school, unread, schools] = await Promise.all([
    actor.schoolId ? db.school.findUnique({ where: { id: actor.schoolId }, select: { name: true } }) : null,
    db.notification.count({ where: { userId: actor.userId, readAt: null } }),
    actor.permissions.has("schools.manage") ? db.school.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : undefined,
  ]);
  const nav = buildNav(actor.role, actor.permissions);
  const schoolName = school?.name ?? "No school selected";

  return (
    <div className="min-h-dvh">
      <Sidebar items={nav} schoolName={schoolName} />
      <div className="lg:pl-64">
        <Topbar
          user={{ name: `${actor.firstName} ${actor.lastName}`, email: actor.email, roleName: actor.roleName, avatarFileId: actor.avatarFileId }}
          schoolName={schoolName}
          nav={nav}
          bottom={bottomNav(nav, actor.role)}
          unread={unread}
          schools={schools}
          activeSchoolId={actor.schoolId}
          logoutAction={logoutAction}
          switchSchoolAction={schools ? switchSchoolAction : undefined}
        />
        <main id="main" className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>
    </div>
  );
}
