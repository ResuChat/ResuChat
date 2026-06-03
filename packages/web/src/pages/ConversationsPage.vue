<template>
  <div class="conversations-page">
    <!-- 上传遮罩 -->
    <div v-if="uploading" class="upload-overlay">
      <div class="upload-overlay-card">
        <el-icon class="is-loading" :size="48">
          <Loading />
        </el-icon>
        <p class="upload-overlay-title">正在预解析文件...</p>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" :style="{ width: uploadProgress + '%' }" />
        </div>
        <p class="upload-overlay-hint">
          {{ uploadStatusText }}
        </p>
      </div>
    </div>

    <div class="page-container">
      <div class="page-header">
        <h2>会话历史</h2>
        <el-button type="primary" @click="showUpload = true">
          <el-icon><Plus /></el-icon>
          新建对话
        </el-button>
      </div>

      <div v-if="showUpload" class="upload-section">
        <el-card>
          <template #header>
            <div class="upload-header">
              <span>上传简历</span>
              <el-button size="small" @click="showUpload = false"> 取消 </el-button>
            </div>
          </template>

          <div
            class="upload-area"
            @click="triggerFile"
            @dragover.prevent
            @drop.prevent="handleDrop"
          >
            <input
              ref="fileInputRef"
              type="file"
              accept=".pdf,.doc,.docx"
              style="display: none"
              @change="handleFileSelect"
            />
            <div v-if="!selectedFile" class="upload-placeholder">
              <el-icon :size="48">
                <UploadFilled />
              </el-icon>
              <p>点击或拖拽上传 PDF / Word 文件</p>
            </div>
            <div v-else class="file-info">
              <el-icon :size="32">
                <Document />
              </el-icon>
              <span>{{ selectedFile.name }}</span>
              <el-button size="small" @click.stop="clearFile"> 重新选择 </el-button>
            </div>
          </div>

          <el-form class="prompt-form" @submit.prevent="handleUpload">
            <el-form-item label="提示">
              <el-input
                v-model="prompt"
                type="textarea"
                :rows="3"
                placeholder="请分析这份简历..."
              />
            </el-form-item>
            <el-button type="primary" :disabled="!selectedFile || uploading" @click="handleUpload">
              {{ uploading ? '上传中...' : '开始对话' }}
            </el-button>
          </el-form>
        </el-card>
      </div>

      <div v-if="store.conversationsLoading" class="loading-wrap">
        <el-icon class="is-loading" :size="32">
          <Loading />
        </el-icon>
        <p>加载会话中...</p>
      </div>

      <el-empty
        v-else-if="store.conversations.length === 0"
        description="还没有会话，点击上方按钮创建一个"
      />

      <div v-else class="conversation-list">
        <el-card v-for="conv in store.conversations" :key="conv.id" class="conv-card">
          <div class="conv-card-content" @click="goToEditor(conv.id)">
            <div class="conv-title">
              {{ conv.title || '无标题会话' }}
            </div>
            <div class="conv-meta">
              <span class="conv-time">{{ formatTime(conv.updated_at) }}</span>
              <span class="conv-id">{{
                conv.id.length > 12 ? conv.id.slice(0, 12) + '...' : conv.id
              }}</span>
            </div>
          </div>
          <el-button
            class="delete-btn"
            type="danger"
            :icon="Delete"
            link
            @click.stop="handleDelete(conv.id)"
          >
            删除
          </el-button>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, UploadFilled, Document, Loading, Delete } from '@element-plus/icons-vue'
import { useResumeStore } from '@/stores/resume'
import { deleteConversation, api } from '@/api'
import { formatTime } from '@/lib/format'

const router = useRouter()
const store = useResumeStore()
const showUpload = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
let uploadProgressTimer: ReturnType<typeof setInterval> | null = null
const uploadStatusText = ref('正在上传文件...')
const selectedFile = ref<File | null>(null)
const prompt = ref('')
const fileInputRef = ref<HTMLInputElement>()

store.fetchConversations(1, 50)

function triggerFile() {
  fileInputRef.value?.click()
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    selectedFile.value = file
  }
}

function handleDrop(e: DragEvent) {
  const file = e.dataTransfer?.files[0]
  if (file && (file.type === 'application/pdf' || file.name.match(/\.(doc|docx)$/i))) {
    selectedFile.value = file
  } else {
    ElMessage.warning('请上传 PDF 或 Word 文件')
  }
}

function clearFile() {
  selectedFile.value = null
  prompt.value = ''
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

async function handleUpload() {
  if (!selectedFile.value) return
  uploading.value = true
  uploadProgress.value = 0
  uploadStatusText.value = '正在上传文件...'

  const startTime = Date.now()
  const phases = [
    { max: 15, text: '正在上传文件...' },
    { max: 30, text: '正在提取文件内容...' },
    { max: 55, text: '正在解析为结构化格式...' },
    { max: 80, text: '正在构建索引...' },
    { max: 93, text: '即将完成...' },
    { max: 99.5, text: '最后处理中...' }
  ]

  uploadProgressTimer = setInterval(() => {
    const t = (Date.now() - startTime) / 1000
    const max = 99.5 - 99.5 / Math.exp(t * 0.12)
    uploadProgress.value = Math.floor(max * 10) / 10
    const p = phases.find((ph) => uploadProgress.value <= ph.max)
    if (p && uploadStatusText.value !== p.text) uploadStatusText.value = p.text
  }, 150)

  try {
    const formData = new FormData()
    formData.append('files', selectedFile.value)
    formData.append('query', prompt.value.trim() || '请分析这份简历')

    const result = await api.post('/rag/start', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 240000
    })

    if (uploadProgressTimer) clearInterval(uploadProgressTimer)
    uploadStatusText.value = '解析完成'
    const animateTo100 = () => {
      if (uploadProgress.value >= 99.9) {
        uploadProgress.value = 100
        return
      }
      uploadProgress.value += Math.max(0.5, (100 - uploadProgress.value) / 8)
      requestAnimationFrame(animateTo100)
    }
    animateTo100()

    const { conversationId } = result as unknown as {
      conversationId: string
      initialPrompt: string
    }

    const fileBlobUrl = URL.createObjectURL(selectedFile.value)
    store.setConversationId(conversationId)
    store.setPrompt(prompt.value.trim() || '请分析这份简历')
    store.setFile(selectedFile.value.name, selectedFile.value.type, '', fileBlobUrl)

    setTimeout(() => router.push(`/editor/${conversationId}`), 500)
  } catch (e) {
    console.error('Upload failed:', e)
    ElMessage.error('上传失败，请重试')
    uploading.value = false
    uploadProgress.value = 0
  } finally {
    if (uploadProgressTimer) clearInterval(uploadProgressTimer)
  }
}

function goToEditor(id: string) {
  router.push(`/editor/${id}`)
}

async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除这个会话吗？删除后可在回收站恢复。', '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await deleteConversation(id)
    // 从本地列表移除
    store.conversations = store.conversations.filter((c) => c.id !== id)
    ElMessage.success('已删除')
  } catch (e) {
    if (e !== 'cancel') {
      console.error('Delete failed:', e)
      ElMessage.error('删除失败')
    }
  }
}
</script>

<style scoped>
.conversations-page {
  padding-top: 50px;
  min-height: 100vh;
  background: #f5f7fa;
}

.page-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  color: #333;
}

.upload-section {
  margin-bottom: 24px;
}

.upload-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.upload-area {
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s;
  margin-bottom: 16px;
}

.upload-area:hover {
  border-color: #409eff;
}

.upload-placeholder {
  color: #909399;
}

.upload-placeholder p {
  margin-top: 8px;
  font-size: 14px;
}

.file-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #333;
}

.prompt-form {
  margin-top: 16px;
}

.loading-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
  color: #909399;
  gap: 12px;
}

.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.conv-card {
  cursor: pointer;
  transition:
    box-shadow 0.2s,
    transform 0.15s;
  position: relative;
}

.conv-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.delete-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  opacity: 0;
  transition: opacity 0.2s;
}

.conv-card:hover .delete-btn {
  opacity: 1;
}

.conv-card-content {
  padding: 4px 0;
}

.conv-title {
  font-size: 15px;
  font-weight: 500;
  color: #333;
  margin-bottom: 6px;
}

.conv-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #999;
}

.upload-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.upload-overlay-card {
  background: #fff;
  border-radius: 12px;
  padding: 40px 48px;
  text-align: center;
  min-width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.upload-overlay-title {
  font-size: 16px;
  color: #333;
  margin: 16px 0 20px;
  font-weight: 500;
}

.progress-bar-track {
  width: 240px;
  height: 6px;
  background: #e8eaed;
  border-radius: 3px;
  margin: 0 auto;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #409eff, #66b1ff);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.upload-overlay-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 12px;
}
</style>
