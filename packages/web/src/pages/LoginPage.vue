<template>
  <div class="login-page">
    <el-card class="login-card">
      <template #header>
        <div class="card-header">
          <h2>简历优化助手</h2>
          <p class="subtitle">上传简历，使用AI智能润色</p>
        </div>
      </template>

      <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent="handleSubmit">
        <el-form-item prop="phone">
          <el-input
            v-model="form.phone"
            placeholder="请输入手机号"
            :prefix-icon="Iphone"
            @blur="onPhoneBlur"
          />
        </el-form-item>

        <el-form-item prop="captcha">
          <div class="captcha-box">
            <el-input v-model="form.captcha" placeholder="请输入图形验证码" class="captcha-input" />
            <img
              :src="captchaUrl"
              alt="验证码"
              class="captcha-img"
              title="点击刷新"
              @click="onCaptchaClick"
              @error="onCaptchaError"
            />
          </div>
        </el-form-item>

        <el-button type="primary" class="login-btn" :disabled="!isFormValid" @click="handleSubmit">
          登录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Iphone } from '@element-plus/icons-vue'

const router = useRouter()
const formRef = ref<FormInstance>()

const form = reactive({
  phone: '',
  captcha: ''
})

const rules: FormRules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }
  ],
  captcha: [{ required: true, message: '请输入图形验证码', trigger: 'blur' }]
}

const PHONE_KEY = 'login_phone'
const TOKEN_KEY = 'auth_token'

const DEFAULT_CAPTCHA =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><rect width="100" height="40" fill="%23eee"/><text x="50" y="25" font-size="20" fill="%23999" text-anchor="middle">?</text></svg>'
const captchaKey = ref('')
const captchaUrl = ref(DEFAULT_CAPTCHA)
const captchaLoaded = ref(false)

const isFormValid = computed(() => {
  return form.phone && /^1[3-9]\d{9}$/.test(form.phone) && form.captcha
})

function onCaptchaError() {
  captchaUrl.value = DEFAULT_CAPTCHA
}

onUnmounted(() => {
  if (captchaUrl.value && captchaUrl.value !== DEFAULT_CAPTCHA) {
    URL.revokeObjectURL(captchaUrl.value)
  }
})

async function refreshCaptcha() {
  try {
    const response = await fetch('/api/captcha/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'image/png'
      },
      body: JSON.stringify({ phone: form.phone })
    })
    const key = response.headers.get('Captcha-Key')
    if (key) captchaKey.value = key
    const blob = await response.blob()
    if (captchaUrl.value && captchaUrl.value !== DEFAULT_CAPTCHA) {
      URL.revokeObjectURL(captchaUrl.value)
    }
    captchaUrl.value = URL.createObjectURL(blob)
  } catch (e) {
    console.error('获取验证码失败:', e)
  }
}

function onCaptchaClick() {
  if (!form.phone || !/^1[3-9]\d{9}$/.test(form.phone)) {
    ElMessage.warning('请先填写正确的手机号')
    return
  }
  refreshCaptcha()
}

function onPhoneBlur() {
  if (/^1[3-9]\d{9}$/.test(form.phone) && !captchaLoaded.value) {
    captchaLoaded.value = true
    refreshCaptcha()
  }
}

async function handleSubmit() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: form.phone,
            captcha: form.captcha,
            key: captchaKey.value
          })
        })

        if (!response.ok) {
          const data = await response.json()
          ElMessage.error(data.message || '登录失败')
          await refreshCaptcha()
          form.captcha = ''
          return
        }

        const data = (await response.json()) as { token: string; username: string }
        localStorage.setItem(TOKEN_KEY, data.token)
        localStorage.setItem(PHONE_KEY, form.phone)
        ElMessage.success('登录成功')
        router.push('/conversations')
      } catch (e) {
        console.error('登录失败:', e)
        ElMessage.error('登录失败，请重试')
      }
    }
  })
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 400px;
}

.card-header h2 {
  margin: 0;
  text-align: center;
  color: #333;
}

.subtitle {
  margin: 8px 0 0;
  text-align: center;
  color: #666;
  font-size: 14px;
}

.captcha-box {
  display: flex;
  gap: 10px;
  width: 100%;
}

.captcha-input {
  flex: 1;
}

.captcha-img {
  height: 32px;
  cursor: pointer;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
}

.login-btn {
  width: 100%;
  margin-top: 10px;
}
</style>
