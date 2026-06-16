import { z } from 'zod'
import { PaginationQuery } from './common.dto'

/** GET /documents 查询参数 */
export const DocsQuery = z.object({
  conversationId: z.string().min(1)
})

export type DocsQuery = z.infer<typeof DocsQuery>

/** DELETE /documents/:refId 查询参数 */
export const DeleteDocQuery = z.object({
  conversationId: z.string().min(1)
})

export type DeleteDocQuery = z.infer<typeof DeleteDocQuery>

/** GET /user-documents 查询参数 */
export const UserDocumentsQuery = PaginationQuery.extend({
  search: z.string().trim().optional(),
  fileType: z.string().trim().optional(),
  contentCategory: z.string().trim().optional(),
  parseStatus: z.string().trim().optional()
})

export type UserDocumentsQuery = z.infer<typeof UserDocumentsQuery>

/** PATCH /user-documents/:id 请求 */
export const RenameUserDocumentRequest = z.object({
  localName: z.string().trim().min(1).max(200)
})

export type RenameUserDocumentRequest = z.infer<typeof RenameUserDocumentRequest>

/** POST /user-documents/import 请求 */
export const ImportUserDocumentRequest = z.object({
  refId: z.coerce.number().int().positive()
})

export type ImportUserDocumentRequest = z.infer<typeof ImportUserDocumentRequest>
