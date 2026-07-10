<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { t } from '@/i18n';
import { api, apiPatch } from '@/utils/api';

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const config = ref(null);
const form = ref({ defaultTarget: 'mixed' });

async function load() {
  loading.value = true;
  try {
    config.value = await api('/api/admin/subscription-converter/settings');
    form.value.defaultTarget = config.value.defaultTarget || 'mixed';
  } catch (e) {
    ElMessage.error(e.message || t('common.permissionDenied'));
    router.replace('/dashboard');
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    config.value = await apiPatch('/api/admin/subscription-converter/settings', { defaultTarget: form.value.defaultTarget });
    ElMessage.success(t('common.success'));
  } catch (e) {
    ElMessage.error(e.message || t('common.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <el-card v-loading="loading">
      <template #header>{{ t('subConverter.title') }}</template>

      <el-alert type="success" :closable="false" style="margin-bottom: 16px">
        {{ t('subConverter.alert') }}
      </el-alert>

      <el-descriptions v-if="config" :column="1" border>
        <el-descriptions-item :label="t('subConverter.mode')">{{ t('subConverter.localMode') }}</el-descriptions-item>
        <el-descriptions-item :label="t('subConverter.supportedTargets')">
          {{ config.supportedTargets.join(', ') }}
        </el-descriptions-item>
      </el-descriptions>

      <el-form label-position="top" style="margin-top: 16px">
        <el-form-item :label="t('subConverter.defaultTarget')">
          <el-select v-model="form.defaultTarget" style="width: 240px">
            <el-option label="mixed" value="mixed" />
            <el-option label="clash" value="clash" />
            <el-option label="sing-box" value="sing-box" />
          </el-select>
        </el-form-item>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </el-form>

      <p class="hint">{{ t('subConverter.hint') }}</p>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
  width: 100%;
}
.title {
  margin: 0 0 16px;
  font-size: 20px;
}
.hint {
  margin-top: 16px;
  color: #909399;
  font-size: 13px;
}
@media (max-width: 640px) {
  .page {
    max-width: none;
  }

  :deep(.el-select) {
    width: 100% !important;
  }
}
</style>

