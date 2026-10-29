import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ChevronRight, GraduationCap, Megaphone, NotebookPen, School, SearchX, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { sp } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/url-controls";
import { requireActor } from "@/lib/auth/actor";
import { globalSearch } from "@/server/services/search.service";

export const metadata: Metadata = { title: "Search" };

const ICONS = { students: GraduationCap, teachers: Users, classes: School, subjects: BookOpen, assignments: NotebookPen, notices: Megaphone } as const;

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor();
  const q = sp(await searchParams, "q") ?? "";
  const groups = await globalSearch(actor, q);
  const total = groups.reduce((n, g) => n + g.hits.length, 0);
  return (
    <>
      <PageHeader title="Search" description={q ? `${total} result${total === 1 ? "" : "s"} for “${q}”` : "Search students, teachers, classes, subjects, assignments and notices."} />
      <div className="mb-6 max-w-xl"><SearchInput placeholder="Type at least 2 characters…" className="sm:w-full" /></div>
      {q.length < 2 ? null : groups.length === 0 ? (
        <Card><EmptyState icon={<SearchX />} title="No matches" description="Try a different name, ID or keyword." /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {groups.map((g) => {
            const Icon = ICONS[g.key as keyof typeof ICONS] ?? GraduationCap;
            return (
              <Card key={g.key}>
                <CardHeader title={g.label} icon={<Icon />} description={`${g.hits.length} match${g.hits.length === 1 ? "" : "es"}`} />
                <ul className="divide-y">
                  {g.hits.map((h) => (
                    <li key={h.id}>
                      <Link href={h.href} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50">
                        {h.avatarFileId !== undefined && <Avatar name={h.title} fileId={h.avatarFileId} size="sm" />}
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{h.title}</span><span className="block truncate text-xs text-muted-foreground">{h.subtitle}</span></span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
