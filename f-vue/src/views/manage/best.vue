<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { t } from '@/i18n';
import { api, apiPatch, apiPost } from '@/utils/api';

const router = useRouter();
const loading = ref(false);
const savingSources = ref(false);
const savingInline = ref(false);
const refreshing = ref(false);
const minting = ref(false);
const config = ref(null);
const manageConfig = ref(null);
const sourceUrlsText = ref('');
const ipsText = ref('');
const bestToken = ref(null);
const inlineEnabled = ref(false);

const canManageBestSettings = computed(() => manageConfig.value?.isSuperAdmin === true);

async function load() {
  loading.value = true;
  try {
    const [bestConfig, adminConfig] = await Promise.all([
      api('/api/admin/best-ip/settings'),
      api('/api/admin/settings'),
    ]);
    config.value = bestConfig;
    manageConfig.value = adminConfig;
    sourceUrlsText.value = config.value?.sourceUrlsText || '';
    inlineEnabled.value = Boolean(config.value?.inlineInSubscription);
  } catch (e) {
    ElMessage.error(e.message || t('common.permissionDenied'));
    router.replace('/dashboard');
  } finally {
    loading.value = false;
  }
}

async function saveSources() {
  if (!canManageBestSettings.value) return ElMessage.warning(t('best.noPermission'));
  savingSources.value = true;
  try {
    config.value = await apiPatch('/api/super-admin/best-ip/settings', { sourceUrls: sourceUrlsText.value });
    ElMessage.success(t('best.savedSources'));
  } catch (e) {
    ElMessage.error(e.message || t('common.saveFailed'));
  } finally {
    savingSources.value = false;
  }
}

async function refreshFromSources() {
  if (!canManageBestSettings.value) return ElMessage.warning(t('best.noPermission'));
  refreshing.value = true;
  try {
    const data = await apiPost('/api/super-admin/best-ip/refresh', {});
    const extra = data.sourceErrors?.length ? t('best.sourcePartial', { count: data.sourceErrors.length }) : '';
    ElMessage.success(t('best.merged', { sources: config.value?.sourceCount || 0, count: data.count, extra }));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('best.mergeFailed'));
  } finally {
    refreshing.value = false;
  }
}

async function refreshManualIps() {
  if (!canManageBestSettings.value) return ElMessage.warning(t('best.noPermission'));
  if (!ipsText.value.trim()) {
    return refreshFromSources();
  }
  refreshing.value = true;
  try {
    const data = await apiPost('/api/super-admin/best-ip/refresh', { ipsText: ipsText.value });
    ElMessage.success(t('best.cachedIps', { count: data.count }));
    ipsText.value = '';
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('best.refreshFailed'));
  } finally {
    refreshing.value = false;
  }
}

async function mintToken() {
  if (!canManageBestSettings.value) return ElMessage.warning(t('best.noPermission'));
  minting.value = true;
  try {
    bestToken.value = await apiPost('/api/super-admin/best-ip/access-tokens', {});
    ElMessage.success(t('best.tokenMinted'));
  } catch (e) {
    ElMessage.error(e.message || t('best.mintFailed'));
  } finally {
    minting.value = false;
  }
}

async function saveInline() {
  if (!canManageBestSettings.value) return ElMessage.warning(t('best.noPermission'));
  savingInline.value = true;
  try {
    await apiPatch('/api/super-admin/best-ip/settings', { inlineInSubscription: inlineEnabled.value });
    ElMessage.success(t('common.success'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.saveFailed'));
  } finally {
    savingInline.value = false;
  }
}

async function copyText(text) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  ElMessage.success(t('dashboard.copied'));
}

onMounted(load);
</script>

<template>
  <div class="page">
    <el-alert v-if="canManageBestSettings" type="success" :closable="false" style="margin-bottom: 16px">
      {{ t('best.alert') }}
    </el-alert>

    <el-card v-loading="loading" style="margin-bottom: 16px">
      <template #header>{{ t('best.cacheStatus') }}</template>
      <el-descriptions v-if="config" :column="1" border>
        <el-descriptions-item :label="t('best.cached')">{{ config.cached ? t('common.yes') : t('common.no') }}</el-descriptions-item>
        <el-descriptions-item :label="t('best.ipCount')">{{ config.ipCount }}</el-descriptions-item>
        <el-descriptions-item v-if="canManageBestSettings" :label="t('best.sourceCount')">{{ config.sourceCount }}</el-descriptions-item>
        <el-descriptions-item :label="t('best.updatedAt')">{{ config.updatedAt || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card v-if="canManageBestSettings" style="margin-bottom: 16px">
      <template #header>{{ t('best.sourceTitle') }}</template>
      <p class="hint">{{ t('best.sourceHint') }}</p>
      <el-input
        v-model="sourceUrlsText"
        type="textarea"
        :rows="5"
        placeholder="https://example.com/best_ips.txt?port=443&#10;https://example.org/best_ips_bj.txt?port=443"
      />
      <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap">
        <el-button type="primary" :loading="savingSources" @click="saveSources">{{ t('best.saveUrl') }}</el-button>
        <el-button type="success" :loading="refreshing" @click="refreshFromSources">{{ t('best.mergeFromSources') }}</el-button>
      </div>
    </el-card>

    <el-card v-if="canManageBestSettings" style="margin-bottom: 16px">
      <template #header>{{ t('best.manualTitle') }}</template>
      <p class="hint">{{ t('best.manualHint') }}</p>
      <el-input v-model="ipsText" type="textarea" :rows="4" placeholder="103.118.42.136:8443#TW-01&#10;1.2.3.4:443" />
      <el-button type="primary" :loading="refreshing" style="margin-top: 12px" @click="refreshManualIps">
        {{ t('best.writeManual') }}
      </el-button>
    </el-card>

    <el-card v-if="canManageBestSettings" style="margin-bottom: 16px">
      <template #header>{{ t('best.tokenTitle') }}</template>
      <p class="hint">{{ t('best.tokenHint') }}</p>
      <el-button type="primary" :loading="minting" @click="mintToken">{{ t('best.mintToken') }}</el-button>
      <el-input v-if="bestToken?.token" :model-value="bestToken.token" readonly style="margin-top: 12px">
        <template #append>
          <el-button @click="copyText(bestToken.token)">{{ t('common.copy') }}</el-button>
        </template>
      </el-input>
    </el-card>

    <el-card v-if="canManageBestSettings">
      <template #header>{{ t('best.inlineTitle') }}</template>
      <el-form label-position="left">
        <el-form-item :label="t('best.inlineLabel')">
          <el-switch v-model="inlineEnabled" />
        </el-form-item>
        <el-button type="primary" :loading="savingInline" @click="saveInline">{{ t('common.save') }}</el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  max-width: 760px;
  width: 100%;
}
.title {
  margin: 0 0 16px;
  font-size: 20px;
}
.hint {
  color: #909399;
  font-size: 13px;
  margin: 0 0 12px;
}
code {
  background: #f4f4f5;
  padding: 2px 6px;
  border-radius: 4px;
}
@media (max-width: 640px) {
  .page {
    max-width: none;
  }

  :deep(.el-card + .el-card) {
    margin-top: 14px;
  }

  :deep(.el-input-group) {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  :deep(.el-input-group__append) {
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
    width: 100%;
  }

  :deep(.el-input-group__append .el-button) {
    width: 100%;
    margin: 0;
  }
}
</style>

