import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { FilePurpose } from "@/generated/prisma/enums";
import { DOCUMENT_TYPES, EXTENSIONS, IMAGE_TYPES, extensionOf } from "@/lib/validation/files";
import { NotFoundError as NF, ValidationError } from "@/server/errors";
import type { Actor } from "@/server/authz/guards";
import { storage } from "@/server/storage";

/** Magic-byte signatures for formats where sniffing is reliable. */
const SIGNATURES: Array<{ type: string; bytes: number[]; offset?: number }> = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: "image/webp", bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  { type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  // OOXML (docx/xlsx/pptx) and zip share the PK header.
  { type: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
];

const ZIP_BASED = new Set([
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function matches(buf: Buffer, sig: { bytes: number[]; offset?: number }) {
  const o = sig.offset ?? 0;
  return sig.bytes.every((b, i) => buf[o + i] === b);
}

/** Validates type, extension, size and content signature. Returns the trusted MIME type. */
export function validateUpload(
  file: { name: string; type: string; size: number },
  content: Buffer,
  kind: "image" | "document",
) {
  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
  const allowed: readonly string[] = kind === "image" ? IMAGE_TYPES : DOCUMENT_TYPES;
  const type = file.type || "application/octet-stream";
  if (file.size === 0 || content.length === 0) throw new ValidationError("The selected file is empty.");
  if (file.size > maxBytes || content.length > maxBytes) {
    throw new ValidationError(`Files must be smaller than ${env().MAX_UPLOAD_MB} MB.`);
  }
  if (!allowed.includes(type)) throw new ValidationError("This file type is not allowed.");
  const ext = extensionOf(file.name);
  if (!EXTENSIONS[type]?.includes(ext)) throw new ValidationError("The file extension does not match its type.");

  const sig = SIGNATURES.find((s) => (ZIP_BASED.has(type) ? s.type === "application/zip" : s.type === type));
  if (sig && !matches(content, sig)) throw new ValidationError("The file content does not match its type.");
  if (type === "text/plain" || type === "text/csv") {
    // Reject binary content masquerading as text.
    if (content.subarray(0, 4096).includes(0)) throw new ValidationError("The file content does not match its type.");
  }
  return type;
}

export function sanitizeFilename(name: string) {
  const cleaned = name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(0, 150);
}

type Links = { assignmentId?: string; submissionId?: string; noticeId?: string };

/** Validates and stores an uploaded File, returning the DB record. */
export async function storeUpload(
  actor: { userId: string; schoolId: string | null },
  file: File,
  purpose: FilePurpose,
  links: Links = {},
) {
  const content = Buffer.from(await file.arrayBuffer());
  const kind = purpose === "AVATAR" || purpose === "SCHOOL_LOGO" ? "image" : "document";
  const mimeType = validateUpload(file, content, kind);
  const ext = extensionOf(file.name);
  const key = `${actor.schoolId ?? "system"}/${purpose.toLowerCase()}/${randomUUID()}.${ext}`;
  await storage().put(key, content, mimeType);
  try {
    return await db.file.create({
      data: {
        schoolId: actor.schoolId,
        uploadedById: actor.userId,
        storageKey: key,
        originalName: sanitizeFilename(file.name),
        mimeType,
        size: content.length,
        purpose,
        ...links,
      },
    });
  } catch (err) {
    await storage().delete(key).catch(() => undefined);
    throw err;
  }
}

/** Extracts non-empty File entries from FormData. */
export function filesFromForm(formData: FormData, field: string): File[] {
  return formData
    .getAll(field)
    .filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v && (v as File).size > 0);
}

export async function deleteStoredFile(fileId: string) {
  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file) return;
  await db.file.delete({ where: { id: fileId } });
  await storage().delete(file.storageKey).catch(() => undefined);
}

/**
 * Authorises a file download. Rules follow the owning record:
 *  - avatars & school logo: any signed-in user of the same school
 *  - assignment attachments: anyone who can see the assignment
 *  - submissions: the student, their parents, and staff who can see the assignment
 *  - notice attachments: anyone the notice is addressed to
 */
export async function authorizeFileAccess(actor: Actor, fileId: string) {
  // Services are imported lazily: they import this module for uploads (avoids a cycle).
  const file = await db.file.findUnique({ where: { id: fileId }, include: { submission: true } });
  if (!file) throw new NF("File");
  const sameSchool = file.schoolId === null || file.schoolId === actor.schoolId || actor.role === "SUPER_ADMIN";
  if (!sameSchool) throw new NF("File");
  switch (file.purpose) {
    case "AVATAR":
    case "SCHOOL_LOGO":
      return file;
    case "ASSIGNMENT_ATTACHMENT": {
      const { getAssignment } = await import("./assignments.service");
      if (!file.assignmentId) throw new NF("File");
      await getAssignment(actor, file.assignmentId);
      return file;
    }
    case "SUBMISSION": {
      if (!file.submission) throw new NF("File");
      const { getAssignment } = await import("./assignments.service");
      const { canManage, learnerId } = await getAssignment(actor, file.submission.assignmentId);
      const isOwner = learnerId === file.submission.studentId && (actor.studentId === learnerId || Boolean(actor.parentId));
      if (canManage || isOwner || actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") return file;
      if (actor.parentId) {
        const link = await db.parentStudent.findFirst({ where: { parentId: actor.parentId, studentId: file.submission.studentId } });
        if (link) return file;
      }
      throw new NF("File");
    }
    case "NOTICE_ATTACHMENT": {
      const { getNotice } = await import("./notices.service");
      if (!file.noticeId) throw new NF("File");
      await getNotice(actor, file.noticeId);
      return file;
    }
    default:
      if (file.uploadedById === actor.userId || actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") return file;
      throw new NF("File");
  }
}
