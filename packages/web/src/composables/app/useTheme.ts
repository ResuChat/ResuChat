import { watchEffect } from 'vue'
import { useDark, useToggle, useCssVar } from '@vueuse/core'

const isDark = useDark({
  selector: 'html',
  attribute: 'class',
  valueDark: 'dark',
  valueLight: '',
  storageKey: 'app_theme'
})

const toggleDark = useToggle(isDark)

const el = document.documentElement
const primary = useCssVar('--el-color-primary', el)
const primaryLight3 = useCssVar('--el-color-primary-light-3', el)
const primaryDark2 = useCssVar('--el-color-primary-dark-2', el)
const fillBlank = useCssVar('--el-fill-color-blank', el)
const inputBg = useCssVar('--el-input-bg-color', el)

watchEffect(() => {
  if (isDark.value) {
    primary.value = '#00bfbf'
    primaryLight3.value = '#00d4d4'
    primaryDark2.value = '#00a6a6'
    fillBlank.value = '#2a2d31'
    inputBg.value = '#2a2d31'
  } else {
    primary.value = '#00a6a6'
    primaryLight3.value = '#00bfbf'
    primaryDark2.value = '#008787'
    fillBlank.value = ''
    inputBg.value = ''
  }
})

export function useTheme() {
  return { isDark, toggle: toggleDark }
}
