import { Router, Request, Response } from 'express'

import { createAuthWithUserMiddleware } from '../../auth/token'
import { getUserByPhone } from '../../storage/repository'

const router: Router = Router()
const authWithUser = createAuthWithUserMiddleware()

router.get('/profile', authWithUser, async (req: Request, res: Response) => {
  try {
    const phone = (req as any).username?.replace(/^user_/, '')
    if (!phone) {
      res.status(401).json({ error: 'Token required' })
      return
    }

    const user = await getUserByPhone(phone)
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json(user)
  } catch (error) {
    console.error('Error fetching user profile:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
