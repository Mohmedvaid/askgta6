import { z } from "zod";
import { POST_KINDS, TOPICS } from "./topics";
import { SPOILER_LEVEL_COUNT } from "./spoilers";
import { isValidUsername } from "./username";

const spoilerLevel = z.coerce.number().int().min(0).max(SPOILER_LEVEL_COUNT - 1);
const uuid = z.string().uuid();

export const postInputSchema = z.object({
  title: z.string().trim().min(8, "Title needs at least 8 characters.").max(140, "Title is capped at 140 characters."),
  body: z.string().trim().min(1, "Write a body before posting.").max(10000, "Body is capped at 10000 characters."),
  topic: z.enum(TOPICS),
  kind: z.enum(POST_KINDS),
  spoilerLevel: spoilerLevel,
  groupId: uuid.nullish(),
});

export const postEditSchema = postInputSchema
  .pick({ title: true, body: true, topic: true, spoilerLevel: true })
  .extend({ postId: uuid });

export const replyInputSchema = z.object({
  postId: uuid,
  body: z.string().trim().min(1, "Write a reply before posting.").max(10000, "Reply is capped at 10000 characters."),
  spoilerLevel: spoilerLevel,
});

export const voteSchema = z.object({
  targetType: z.enum(["post", "reply"]),
  targetId: uuid,
  value: z.coerce.number().int().min(-1).max(1),
});

export const acceptReplySchema = z.object({
  postId: uuid,
  replyId: uuid.nullable(),
});

export const groupInputSchema = z.object({
  name: z.string().trim().min(2, "Name needs at least 2 characters.").max(60, "Name is capped at 60 characters."),
  description: z.string().trim().max(500, "Description is capped at 500 characters.").optional(),
  visibility: z.enum(["public", "private"]),
});

export const inviteCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(6, "Invite codes are 8 characters.")
    .max(24, "That code is too long to be valid."),
});

export const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidUsername, "Use 3 to 20 lowercase letters, digits, or underscores."),
  displayName: z.string().trim().max(40, "Display name is capped at 40 characters.").optional(),
  bio: z.string().trim().max(200, "Bio is capped at 200 characters.").optional(),
});

export const shieldSchema = z.object({
  enabled: z.boolean(),
  progress: spoilerLevel,
});

export const themeSchema = z.object({ theme: z.enum(["dark", "light"]) });

export const reportSchema = z.object({
  targetType: z.enum(["post", "reply"]),
  targetId: uuid,
  reason: z.enum(["spam", "leak", "harassment", "wrong_spoiler_level", "spoiler_in_title", "other"]),
  note: z.string().trim().max(500, "Note is capped at 500 characters.").optional(),
});

export const moderationSchema = z.object({
  targetType: z.enum(["post", "reply"]),
  targetId: uuid,
  action: z.enum(["hide", "unhide", "delete", "dismiss"]),
});

export const adminProfileSchema = z.object({
  userId: uuid,
  username: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidUsername, "Use 3 to 20 lowercase letters, digits, or underscores.")
    .optional(),
  clearBio: z.boolean().optional(),
});

export const blockListSchema = z.object({
  list: z.enum(["domain", "phrase"]),
  action: z.enum(["add", "remove"]),
  // A domain is stored bare and lowercase; a phrase is matched against a
  // lowercased body, so both are normalized here rather than at every read.
  value: z.string().trim().toLowerCase().min(2, "Too short to block.").max(120, "Too long to block."),
  note: z.string().trim().max(120).optional(),
});

export const banSchema = z.object({
  userId: uuid,
  action: z.enum(["ban", "unban"]),
  reason: z.string().trim().max(200, "Keep the reason under 200 characters.").optional(),
});

export const deleteAccountSchema = z.object({
  userId: uuid,
  // Typing the username is the confirmation. There is no undo for this one.
  confirm: z.string().trim().min(1, "Type the username to confirm."),
});

export const avatarSchema = z.object({
  size: z.number().int().max(2 * 1024 * 1024, "Avatars are capped at 2 MB."),
  type: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
});

export type PostInput = z.infer<typeof postInputSchema>;
export type ReplyInput = z.infer<typeof replyInputSchema>;
export type GroupInput = z.infer<typeof groupInputSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type ReportInput = z.infer<typeof reportSchema>;

/** Every server action returns this. Nothing throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "That input is not valid.";
}
