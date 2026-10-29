import { Download, FileText, ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { formatBytes } from "@/lib/validation/files";

export type FileItem = { id: string; originalName: string; size: number; mimeType: string };

export function FileList({ files, action }: { files: FileItem[]; action?: (f: FileItem) => ReactNode }) {
  if (files.length === 0) return null;
  return (
    <ul className="divide-y rounded-lg border">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          {f.mimeType.startsWith("image/") ? <ImageIcon className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
          <a href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate font-medium hover:text-primary">
            {f.originalName}
          </a>
          <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
          <a href={`/api/files/${f.id}?download=1`} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label={`Download ${f.originalName}`}>
            <Download className="size-4" />
          </a>
          {action?.(f)}
        </li>
      ))}
    </ul>
  );
}
