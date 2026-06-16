<template>
  <el-drawer
    :model-value="visible"
    title="参考资料"
    direction="rtl"
    size="340px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div v-if="files.length === 0" class="text-center py-10 text-sm">暂无参考资料</div>
    <div
      v-for="doc in files"
      :key="doc.id"
      class="flex items-center justify-between border-b border-(--border) px-0 py-2.5 text-[13px]"
    >
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <el-tag
          :type="
            contentCategoryOf(doc) === 'resume'
              ? 'success'
              : contentCategoryOf(doc) === 'job'
                ? 'warning'
                : ''
          "
          size="small"
        >
          {{
            contentCategoryOf(doc) === 'resume'
              ? '简历'
              : contentCategoryOf(doc) === 'job'
                ? '岗位资料'
                : '其他资料'
          }}
        </el-tag>
        <span class="overflow-hidden text-ellipsis whitespace-nowrap flex-1 mr-3">{{
          displayNameOf(doc)
        }}</span>
      </div>
      <el-button text type="danger" size="small" @click="$emit('remove', doc.id)"> 删除 </el-button>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import type { ReferenceDoc } from '@/api'

defineProps<{ visible: boolean; files: ReferenceDoc[] }>()
defineEmits<{ 'update:visible': [v: boolean]; remove: [id: number] }>()

function contentCategoryOf(doc: ReferenceDoc) {
  return doc.category
}

function displayNameOf(doc: ReferenceDoc) {
  return doc.local_name || doc.original_name
}
</script>
