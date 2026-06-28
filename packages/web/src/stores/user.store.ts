import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getUserProfile,
  bindPhone as bindPhoneApi,
  getUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead
} from '@/api/user'
import { api } from '@/api/client'
import type { UserNotificationRecord, UserProfile, UserRole } from '@/types/api'

export const useUserStore = defineStore(
  'user',
  () => {
    const userInfo = ref<UserProfile | null>(null)
    const userLoading = ref(false)
    const notifications = ref<UserNotificationRecord[]>([])
    const unreadNotificationCount = ref(0)

    async function fetchUserProfile(force = false) {
      if (userInfo.value?.role && !force) return userInfo.value
      userLoading.value = true
      try {
        const { data } = await getUserProfile()
        userInfo.value = data
        return data
      } finally {
        userLoading.value = false
      }
    }

    async function updateProfile(data: { nickname?: string; avatar?: string | null }) {
      await api.patch('/user/profile', data)
      if (userInfo.value) {
        if (data.nickname) userInfo.value.nickname = data.nickname
        if (data.avatar !== undefined) userInfo.value.avatar = data.avatar
      }
    }

    async function bindPhone(phone: string) {
      await bindPhoneApi(phone)
      if (userInfo.value) userInfo.value.phone = phone
    }

    function updateRole(role: UserRole) {
      if (userInfo.value) userInfo.value.role = role
    }

    async function fetchNotifications() {
      const result = await getUserNotifications()
      notifications.value = result.data.notifications
      unreadNotificationCount.value = result.data.unreadCount
      return result
    }

    function prependNotification(notification: UserNotificationRecord) {
      notifications.value = [
        notification,
        ...notifications.value.filter((item) => item.id !== notification.id)
      ].slice(0, 20)
      if (notification.readAt === null) unreadNotificationCount.value += 1
    }

    async function markNotificationRead(id: number) {
      await markUserNotificationRead(id)
      const item = notifications.value.find((notification) => notification.id === id)
      if (item && item.readAt === null) {
        item.readAt = Date.now()
        unreadNotificationCount.value = Math.max(0, unreadNotificationCount.value - 1)
      }
    }

    async function markNotificationsReadAll() {
      await markAllUserNotificationsRead()
      const now = Date.now()
      notifications.value.forEach((notification) => {
        if (notification.readAt === null) notification.readAt = now
      })
      unreadNotificationCount.value = 0
    }

    return {
      userInfo,
      userLoading,
      notifications,
      unreadNotificationCount,
      fetchUserProfile,
      updateProfile,
      bindPhone,
      updateRole,
      fetchNotifications,
      prependNotification,
      markNotificationRead,
      markNotificationsReadAll
    }
  },
  { persist: { pick: ['userInfo', 'notifications', 'unreadNotificationCount'] } }
)
