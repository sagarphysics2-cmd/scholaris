"use client";

import type { Option } from "@/components/forms/fields";
import { useCloseDialog } from "@/components/ui/dialog";
import { linkChildAction } from "./actions";
import { LinkChildForm } from "./parent-form";

export function LinkChildDialogBody({ parentId, students }: { parentId: string; students: Option[] }) {
  const close = useCloseDialog();
  return <LinkChildForm action={linkChildAction} parentId={parentId} students={students} onDone={close} />;
}
