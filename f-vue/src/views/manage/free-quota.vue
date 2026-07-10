<script setup>
import { computed, onMounted, ref } from 'vue';
import QuotaLimitsPanel from '@/components/QuotaLimitsPanel.vue';
import { t } from '@/i18n';
import { apiPost } from '@/utils/api';

const usageLoading = ref(false);
const usage = ref(null);
const usageError = ref('');

const practices = computed(() => [
  t('home.practice1'),
  t('home.practice2'),
  t('home.practice3'),
  t('home.practice4'),
]);

async function loadUsage() {
  usageLoading.value = true;
  usageError.value = '';
  try {
    usage.value = await apiPost('/api/admin/cloudflare/usage', {});
  } catch (e) {
    usage.value = null;
    const msg = e.message || t('home.queryFailed');
    usageError.value =
      msg.includes('配置') || msg.includes('config') || msg.includes('Credential')
        ? t('home.notConfigured')
        : msg;
  } finally {
    usageLoading.value = false;
  }
}

onMounted(loadUsage);
</script>

<template>
  <div class="home-page">
    <QuotaLimitsPanel
      :loading="usageLoading"
      :usage="usage"
      :error="usageError"
      @refresh="loadUsage"
    />

    <el-alert class="f0-banner" type="info" :closable="false">
      {{ t('home.f0Banner') }}
    </el-alert>

    <div class="content-grid">
      <el-card class="panel" shadow="never">
        <template #header>{{ t('home.practicesTitle') }}</template>
        <ul class="practice-list">
          <li v-for="(item, i) in practices" :key="i">{{ item }}</li>
        </ul>
      </el-card>

      <el-card class="panel edge-panel" shadow="never">
        <template #header>{{ t('home.edgeTitle') }}</template>
        <p class="edge-body">{{ t('home.edgeBody') }}</p>
        <p class="panel-hint">{{ t('home.edgeHint') }}</p>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  max-width: 1200px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.f0-banner {
  border-radius: 10px;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: start;
}

.panel {
  border-radius: 12px;
}

.panel :deep(.el-card__header) {
  font-weight: 600;
  padding: 16px 20px;
}

.panel :deep(.el-card__body) {
  padding: 0 20px 20px;
}

.panel-hint {
  color: #909399;
  font-size: 13px;
  margin: 14px 0 0;
  line-height: 1.6;
}

.practice-list {
  margin: 4px 0 0;
  padding-left: 20px;
  line-height: 1.9;
  color: #606266;
}

.edge-panel {
  margin-bottom: 8px;
}

.edge-body {
  margin: 0;
  line-height: 1.8;
  color: #606266;
}

@media (max-width: 900px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .home-page {
    gap: 16px;
  }

  .content-grid {
    gap: 14px;
  }

  .panel :deep(.el-card__header) {
    padding: 14px;
  }

  .panel :deep(.el-card__body) {
    padding: 0 14px 14px;
  }
}
</style>

