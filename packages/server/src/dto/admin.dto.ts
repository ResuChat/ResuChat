import { z } from 'zod'

/** POST /admin/system-documents 请求 */
export const SystemDocUploadRequest = z.object({
  groupId: z.coerce.number().int().positive('groupId is required')
})

export type SystemDocUploadRequest = z.infer<typeof SystemDocUploadRequest>

/** PATCH /admin/system-documents/:id 请求 */
export const SystemDocPatchRequest = z.object({
  active: z.union([z.literal(0), z.literal(1)], {
    message: 'active must be 0 or 1'
  })
})

export type SystemDocPatchRequest = z.infer<typeof SystemDocPatchRequest>

/** 系统文档列表项 */
export const SystemDocRecord = z.object({
  id: z.number(),
  global_doc_id: z.number(),
  group_id: z.number().nullable(),
  category: z.enum(['resume', 'job', 'unknown']),
  group_name: z.string(),
  local_name: z.string(),
  active: z.boolean(),
  index_status: z.enum(['pending', 'indexing', 'done', 'failed']),
  error_message: z.string().nullable(),
  chunks_count: z.number(),
  indexed_at: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
  file_type: z.string(),
  file_size: z.number(),
  original_name: z.string()
})

export type SystemDocRecord = z.infer<typeof SystemDocRecord>

export const SystemDocGroupRequest = z.object({
  name: z.string().min(1, 'name is required'),
  parentId: z.number().int().positive().nullable().optional()
})

export type SystemDocGroupRequest = z.infer<typeof SystemDocGroupRequest>

export const SystemDocGroupPatchRequest = z.object({
  name: z.string().min(1, 'name is required').optional(),
  parentId: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional()
})

export type SystemDocGroupPatchRequest = z.infer<typeof SystemDocGroupPatchRequest>

export const SystemDocGroupRecord = z.object({
  id: z.number(),
  parent_id: z.number().nullable(),
  name: z.string(),
  created_at: z.number(),
  updated_at: z.number()
})

export type SystemDocGroupRecord = z.infer<typeof SystemDocGroupRecord>
