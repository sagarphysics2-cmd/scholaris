import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CalendarCheck2, ChevronRight, GraduationCap, Wallet } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { can, requirePermission } from "@/lib/auth/actor";
import { reportCatalog } from "@/server/services/reports.service";

export const metadata: Metadata = { title: "Reports" };

const ICONS = { Students: GraduationCap, Attendance: CalendarCheck2, Academic: BarChart3, Finance: Wallet } as const;

export default async function ReportsPage() {
  const actor = await requirePermission("reports.view");
  const reports = reportCatalog().filter((r) => r.category !== "Finance" || can(actor, "fees.manage"));
  const categories = [...new Set(reports.map((r) => r.category))];
  return (
    <>
      <PageHeader title="Reports" description="Printable, exportable reports across students, attendance, academics and finance." />
      <div className="grid gap-6 lg:grid-cols-2">
        {categories.map((c) => {
          const Icon = ICONS[c];
          return (
            <Card key={c}>
              <CardHeader title={`${c} reports`} icon={<Icon />} />
              <ul className="divide-y">
                {reports.filter((r) => r.category === c).map((r) => (
                  <li key={r.key}>
                    <Link href={`/reports/${r.key}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/50">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{r.title}</span>
                        <span className="block text-sm text-muted-foreground">{r.description}</span>
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
