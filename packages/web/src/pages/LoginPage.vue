<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="title">聊简历</h1>

      <!-- === 登录 === -->
      <div v-if="!isRegister" class="form">
        <input
          v-model="account"
          placeholder="邮箱 / 手机号"
          class="input"
          @input="onAccountInput"
        />

        <!-- 密码模式（手机号强制） -->
        <template v-if="!useCode || isPhone">
          <input v-model="password" type="password" placeholder="密码" class="input" />
        </template>

        <!-- 验证码模式（仅邮箱） -->
        <template v-else>
          <div class="captcha-row">
            <input v-model="emailCode" placeholder="邮箱验证码" class="input flex-1" />
            <button :disabled="!account || sending" class="code-btn" @click="sendCode">
              {{ sending ? `${countdown}s` : '发送验证码' }}
            </button>
          </div>
        </template>

        <!-- 小字切换行 → 登录按钮上方 -->
        <div class="mode-row">
          <span v-if="!isPhone" class="link" @click="useCode = !useCode">{{
            useCode ? '密码登录' : '验证码登录'
          }}</span>
          <span v-else />
          <span class="link" @click="isRegister = true">注册</span>
        </div>

        <button
          v-if="!useCode || isPhone"
          :disabled="!account || !password"
          class="btn"
          @click="doPasswordLogin"
        >
          登录
        </button>
        <button
          v-else
          :disabled="!account || !emailCode || !emailKey"
          class="btn"
          @click="doEmailCodeLogin"
        >
          登录
        </button>
      </div>

      <!-- === 注册 === -->
      <div v-else class="form">
        <input v-model="regEmail" placeholder="邮箱" class="input" />
        <div class="captcha-row">
          <input v-model="regCaptcha" placeholder="图形验证码" class="input flex-1" />
          <img
            v-if="regCaptchaImg"
            :src="regCaptchaImg"
            class="captcha-img"
            title="点击刷新"
            @click="fetchRegCaptcha"
          />
        </div>
        <div class="captcha-row">
          <input v-model="regEmailCode" placeholder="邮箱验证码" class="input flex-1" />
          <button :disabled="!regEmail || regSending" class="code-btn" @click="sendRegCode">
            {{ regSending ? `${regCountdown}s` : '发送验证码' }}
          </button>
        </div>
        <input v-model="regPassword" type="password" placeholder="设置密码" class="input" />

        <div class="mode-row">
          <span class="link" @click="isRegister = false">返回登录</span>
          <span />
        </div>

        <button :disabled="!canRegister" class="btn" @click="doRegister">注册</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { login, register, sendEmailCode, saveAuth } from '@/api/auth'

const router = useRouter()
const isRegister = ref(false)
const useCode = ref(false)

// 登录
const account = ref('')
const password = ref('')
const emailCode = ref('')
let emailKey = ''
const sending = ref(false)
const countdown = ref(0)

// 注册
const regEmail = ref('')
const regCaptcha = ref('')
const regCaptchaImg = ref('')
const regEmailCode = ref('')
const regPassword = ref('')
let regCaptchaKey = ''
let regEmailKey = ''
const regSending = ref(false)
const regCountdown = ref(0)

const { pause: pauseLogin, resume: resumeLogin } = useIntervalFn(
  () => {
    countdown.value--
    if (countdown.value <= 0) {
      sending.value = false
      pauseLogin()
    }
  },
  1000,
  { immediate: false, immediateCallback: false }
)

const { pause: pauseReg, resume: resumeReg } = useIntervalFn(
  () => {
    regCountdown.value--
    if (regCountdown.value <= 0) {
      regSending.value = false
      pauseReg()
    }
  },
  1000,
  { immediate: false, immediateCallback: false }
)

const isPhone = computed(() => /^1[3-9]\d{0,9}$/.test(account.value) && account.value.length <= 11)
const canRegister = computed(
  () =>
    regEmail.value &&
    regCaptcha.value &&
    regEmailCode.value &&
    regPassword.value &&
    regCaptchaKey &&
    regEmailKey
)

function onAccountInput() {
  emailKey = ''
}

watch(isRegister, (v) => {
  if (v) fetchRegCaptcha()
})
watch(regEmail, () => {
  if (isRegister.value && regEmail.value) fetchRegCaptcha()
})

async function fetchRegCaptcha() {
  if (!regEmail.value) return
  const res = await axios.post(
    '/api/auth/captcha/generate',
    { phone: regEmail.value },
    { responseType: 'blob' }
  )
  regCaptchaImg.value = URL.createObjectURL(res.data)
  regCaptchaKey = res.headers['captcha-key'] || ''
}

async function sendCode() {
  try {
    const res = await sendEmailCode(account.value)
    emailKey = res.data.key
    sending.value = true
    countdown.value = 60
    resumeLogin()
    ElMessage.success('验证码已发送')
  } catch {
    ElMessage.error('发送失败')
  }
}
async function sendRegCode() {
  try {
    const res = await sendEmailCode(regEmail.value)
    regEmailKey = res.data.key
    regSending.value = true
    regCountdown.value = 60
    resumeReg()
    ElMessage.success('验证码已发送')
  } catch {
    ElMessage.error('发送失败')
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

async function doPasswordLogin() {
  try {
    const res = isPhone.value
      ? await login({
          mode: 'phone',
          phone: account.value,
          password: password.value
        })
      : await login({
          mode: 'password',
          email: account.value,
          password: password.value
        })
    saveAuth(res.data.accessToken, res.data.refreshToken, isPhone.value ? account.value : null)
    router.push('/app/chat')
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, '登录失败'))
  }
}

async function doEmailCodeLogin() {
  try {
    const res = await login({
      mode: 'email-code',
      email: account.value,
      code: emailCode.value,
      key: emailKey
    })
    saveAuth(res.data.accessToken, res.data.refreshToken)
    router.push('/app/chat')
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, '登录失败'))
  }
}

async function doRegister() {
  try {
    const res = await register({
      email: regEmail.value,
      password: regPassword.value,
      emailCode: regEmailCode.value,
      emailKey: regEmailKey,
      captchaCode: regCaptcha.value,
      captchaKey: regCaptchaKey
    })
    saveAuth(res.data.accessToken, res.data.refreshToken)
    router.push('/app/chat')
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, '注册失败'))
  }
}
</script>

<style>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #b2dfdb;
  overflow: hidden;
  position: relative;
  padding: 24px;
}
.login-page::before {
  content: '';
  display: block;
  position: absolute;
  top: -20px;
  left: -20px;
  right: -20px;
  bottom: -20px;
  background: linear-gradient(
    135deg in oklch,
    oklch(0.75 0.1 200) 0%,
    oklch(0.73 0.11 199) 6.25%,
    oklch(0.69 0.12 198) 12.5%,
    oklch(0.65 0.13 196) 18.75%,
    oklch(0.61 0.14 195) 25%,
    oklch(0.65 0.13 196) 31.25%,
    oklch(0.69 0.12 198) 37.5%,
    oklch(0.73 0.11 199) 43.75%,
    oklch(0.75 0.1 200) 50%,
    oklch(0.73 0.11 199) 56.25%,
    oklch(0.69 0.12 198) 62.5%,
    oklch(0.65 0.13 196) 68.75%,
    oklch(0.61 0.14 195) 75%,
    oklch(0.65 0.13 196) 81.25%,
    oklch(0.69 0.12 198) 87.5%,
    oklch(0.73 0.11 199) 93.75%,
    oklch(0.75 0.1 200) 100%
  );
  background-size: 200% 200%;
  animation: gradientShift 20s linear infinite;
  filter: blur(12px);
  z-index: 0;
}
@keyframes gradientShift {
  0% {
    background-position: 0% 0%;
  }
  100% {
    background-position: 100% 100%;
  }
}
.login-page::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.2);
  pointer-events: none;
  z-index: 1;
}
.login-card {
  position: relative;
  z-index: 2;
  background: color-mix(in oklab, var(--surface) 78%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid var(--border);
  border-radius: var(--radius-panel);
  padding: 40px 32px;
  width: min(400px, 100%);
  box-shadow: var(--shadow-panel);
}
.title {
  text-align: center;
  font-size: 28px;
  margin-bottom: 24px;
  color: var(--text);
}
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  background: var(--control-bg);
  color: var(--text);
  transition:
    border-color 0.18s,
    background-color 0.18s,
    box-shadow 0.18s;
}
.input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--focus-ring);
}
.flex-1 {
  flex: 1;
}
.captcha-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.captcha-img {
  height: 40px;
  cursor: pointer;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.code-btn {
  white-space: nowrap;
  padding: 10px 12px;
  border: 1px solid var(--primary);
  border-radius: var(--radius-control);
  background: var(--control-bg);
  color: var(--primary);
  cursor: pointer;
  font-size: 12px;
  transition:
    background-color 0.18s,
    border-color 0.18s,
    color 0.18s;
}
.code-btn:not(:disabled):hover {
  background: var(--control-hover);
  border-color: var(--primary-dark);
}
.code-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.mode-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.link {
  font-size: 12px;
  color: var(--primary);
  cursor: pointer;
}
.link:hover {
  text-decoration: underline;
}
.btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: var(--radius-control);
  background: var(--primary);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition:
    opacity 0.2s,
    background-color 0.18s;
}
.btn:not(:disabled):hover {
  background: var(--primary-dark);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dark .login-card {
  background: color-mix(in oklab, var(--surface) 82%, transparent);
  border-color: var(--border);
}
</style>
