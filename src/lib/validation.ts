import { z } from 'zod'
import { NextResponse } from 'next/server'

// ── Public share routes ───────────────────────────────────────────────────────

export const postCommentSchema = z.object({
  blockId:    z.string().min(1).max(200).trim(),
  authorName: z.string().min(1).max(100).trim(),
  body:       z.string().min(1).max(10000).trim(),
  parentId:   z.string().uuid().optional(),
})

export const postApprovalSchema = z.object({
  blockId:    z.string().min(1).max(200).trim(),
  authorName: z.string().min(1).max(100).trim(),
  status:     z.enum(['approved', 'changes_requested']),
})

export const postShareReactionSchema = z.object({
  commentId:  z.string().uuid(),
  emoji:      z.string().min(1).max(10),
  authorName: z.string().min(1).max(100).trim(),
})

// ── Authenticated owner routes ────────────────────────────────────────────────

export const ownerReplySchema = z.object({
  blockId:  z.string().min(1).max(200).trim(),
  parentId: z.string().uuid(),
  text:     z.string().min(1).max(10000).trim(),
})

export const ownerReactionSchema = z.object({
  commentId: z.string().uuid(),
  emoji:     z.string().min(1).max(10),
})

export const resolveCommentSchema = z.object({
  commentId: z.string().uuid(),
})

// ── Helper ────────────────────────────────────────────────────────────────────

export function parseBody<T>(schema: z.ZodType<T>, data: unknown):
  | { ok: true; data: T }
  | { ok: false; res: ReturnType<typeof NextResponse.json> }
{
  const result = schema.safeParse(data)
  if (!result.success) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'Invalid request', fields: result.error.flatten().fieldErrors },
        { status: 422 }
      ),
    }
  }
  return { ok: true, data: result.data }
}
