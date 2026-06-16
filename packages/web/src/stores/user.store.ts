import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserProfile, api, bindPhone as bindPhoneApi, type UserProfile } from '@/api'

export const useUserStore = defineStore(
  'user',
  () => {
    const userInfo = ref<UserProfile | null>(null)
    const userLoading = ref(false)

    async function fetchUserProfile(force = false) {
      if (userInfo.value?.role && !force) return userInfo.value
      userLoading.value = true
      try {
        const data = await getUserProfile()
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

    return { userInfo, userLoading, fetchUserProfile, updateProfile, bindPhone }
  },
  { persist: { pick: ['userInfo'] } }
)
