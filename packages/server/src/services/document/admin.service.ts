// Admin service facade — delegates to system-documents/* sub-services
// Public API surface remains stable for routes and controllers.

export type { SystemDocRecord } from '../../storage/document/file-manager'
export type { UploadResult } from '../../types/api'

// Upload & indexing
export {
  uploadSystemDocument,
  processSystemDocumentIndexing,
  deleteSystemDocument,
  listSystemDocuments,
  requeuePendingSystemDocumentIndexing,
  getSystemDocument,
  updateSystemDocumentActive
} from './system-documents/upload.service'

// Groups
export {
  listSystemGroups,
  createSystemGroup,
  updateSystemGroup,
  deleteSystemGroup
} from './system-documents/groups.service'

// Classification (for worker usage)
export {
  classifySystemDocument,
  formatSystemDocumentAsMarkdown
} from './system-documents/classification.service'
export type { ContentCategory } from './system-documents/classification.service'
