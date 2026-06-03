import { Router } from 'express'
import startHandler from './handlers/start'
import searchHandler from './handlers/search'
import modifyHandler from './handlers/modify'
import documentsHandler from './handlers/documents'
import summarizeHandler from './handlers/summarize'

const router: Router = Router()

router.use(startHandler)
router.use(searchHandler)
router.use(modifyHandler)
router.use(documentsHandler)
router.use(summarizeHandler)

export default router
