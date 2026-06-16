<template>
  <el-dialog
    :model-value="visible"
    title="编辑个人资料"
    width="660px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div class="flex gap-4" style="min-height: 320px">
      <!-- 左侧页签 -->
      <div
        class="flex flex-col gap-1 shrink-0"
        style="width: 88px; border-right: 1px solid var(--border); padding-right: 12px"
      >
        <button
          v-for="t in tabs"
          :key="t.key"
          class="tab-btn"
          :class="{ active: activeTab === t.key }"
          @click="activeTab = t.key"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- 右侧内容 -->
      <div class="flex-1 min-w-0">
        <!-- 个人资料 -->
        <div v-if="activeTab === 'profile'">
          <div class="flex flex-col items-center gap-4">
            <div class="relative cursor-pointer" @click="avatarInput?.click()">
              <el-avatar
                v-if="form.avatar"
                :src="form.avatar"
                :size="120"
                shape="circle"
                class="border-2 border-(--border)"
              />
              <el-avatar
                v-else
                :size="120"
                shape="circle"
                class="border-2 border-(--border)"
                style="background: var(--primary); color: #fff"
              >
                <span class="text-4xl">{{
                  (userStore.userInfo?.nickname || '?')[0].toUpperCase()
                }}</span>
              </el-avatar>
              <div
                class="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
              >
                <el-icon :size="20" color="var(--primary)">
                  <Camera />
                </el-icon>
              </div>
            </div>
            <input
              ref="avatarInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onAvatarChange"
            />

            <el-form label-position="top" class="w-full">
              <el-form-item label="昵称">
                <el-input v-model="form.nickname" placeholder="输入昵称" />
              </el-form-item>
              <el-form-item label="手机号">
                <el-input v-model="form.phone" placeholder="绑定手机号（选填）" />
              </el-form-item>
            </el-form>
          </div>
        </div>

        <!-- 修改密码 -->
        <div v-if="activeTab === 'password'" class="flex flex-col gap-4">
          <el-alert
            v-if="!hasPassword"
            title="当前账号未设置密码，可直接设置新密码"
            type="info"
            :closable="false"
            show-icon
          />
          <div class="flex flex-col gap-3">
            <el-input
              v-if="hasPassword"
              v-model="pwdForm.current"
              type="password"
              placeholder="当前密码"
            />
            <el-input v-model="pwdForm.new" type="password" placeholder="新密码（至少6位）" />
            <el-input v-model="pwdForm.confirm" type="password" placeholder="确认新密码" />
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="$emit('update:visible', false)"> 取消 </el-button>
      <el-button
        v-if="activeTab === 'profile'"
        type="primary"
        :loading="saving"
        @click="handleSave"
      >
        保存
      </el-button>
      <el-button
        v-if="activeTab === 'password'"
        type="primary"
        :loading="saving"
        @click="handleChangePwd"
      >
        确认修改
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Camera } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user.store'
import { api, changePassword } from '@/api'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [v: boolean] }>()

const userStore = useUserStore()
const saving = ref(false)
const avatarInput = ref<HTMLInputElement>()
const activeTab = ref('profile')

const tabs = [
  { key: 'profile', label: '个人资料' },
  { key: 'password', label: '修改密码' }
]

const hasPassword = computed(() => !!userStore.userInfo?.hasPassword)
const form = ref({ nickname: '', avatar: '', phone: '' })
const pwdForm = ref({ current: '', new: '', confirm: '' })

function initForm() {
  activeTab.value = 'profile'
  form.value.nickname = userStore.userInfo?.nickname || ''
  form.value.avatar = userStore.userInfo?.avatar || ''
  form.value.phone = userStore.userInfo?.phone || ''
  pwdForm.value = { current: '', new: '', confirm: '' }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null || !('response' in error)) return fallback
  const response = error.response as { data?: { error?: unknown } } | undefined
  return typeof response?.data?.error === 'string' ? response.data.error : fallback
}

watch(
  () => props.visible,
  (v) => {
    if (v) initForm()
  }
)

async function onAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const formData = new FormData()
  formData.append('file', file)
  try {
    const res = (await api.post('/user/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })) as { avatar: string }
    form.value.avatar = res.avatar
    if (userStore.userInfo) userStore.userInfo.avatar = res.avatar
    ElMessage.success('头像已更新')
  } catch {
    ElMessage.error('上传失败')
  }
}

async function handleSave() {
  saving.value = true
  try {
    const data: { nickname?: string; avatar?: string | null } = { nickname: form.value.nickname }
    if (form.value.avatar !== (userStore.userInfo?.avatar || ''))
      data.avatar = form.value.avatar || null
    await userStore.updateProfile(data)
    if (form.value.phone && form.value.phone !== (userStore.userInfo?.phone || '')) {
      await userStore.bindPhone(form.value.phone)
    }
    emit('update:visible', false)
    ElMessage.success('保存成功')
  } catch (e: unknown) {
    ElMessage.error(getErrorMessage(e, '保存失败'))
  } finally {
    saving.value = false
  }
}

async function handleChangePwd() {
  if (!pwdForm.value.new) {
    ElMessage.warning('请输入新密码')
    return
  }
  if (pwdForm.value.new.length < 6) {
    ElMessage.warning('密码至少6位')
    return
  }
  if (pwdForm.value.new !== pwdForm.value.confirm) {
    ElMessage.warning('两次密码不一致')
    return
  }
  if (hasPassword.value && !pwdForm.value.current) {
    ElMessage.warning('请输入当前密码')
    return
  }
  saving.value = true
  try {
    await changePassword(pwdForm.value.current, pwdForm.value.new)
    if (userStore.userInfo) userStore.userInfo.hasPassword = true
    pwdForm.value = { current: '', new: '', confirm: '' }
    ElMessage.success('密码修改成功')
  } catch (e: unknown) {
    ElMessage.error(getErrorMessage(e, '修改失败'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.tab-btn {
  text-align: left;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}
.tab-btn:hover {
  background: var(--primary-bg);
  color: var(--primary);
}
.tab-btn.active {
  background: var(--primary-bg);
  color: var(--primary);
  font-weight: 500;
}
</style>
