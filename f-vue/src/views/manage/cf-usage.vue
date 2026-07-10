<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { t } from '@/i18n';
import { api, apiDelete, apiPost, apiPut } from '@/utils/api';

const router = useRouter();
const loading = ref(false);
const querying = ref(false);
const config = ref(null);
const usage = ref(null);
const tokenValue = ref('');

async function load() {
  loading.value = true;
  try {
    config.value = await api('/api/admin/settings');
  } catch (e) {
    ElMessage.error(e.message || t('common.permissionDenied'));
    router.replace('/dashboard');
  } finally {
    loading.value = false;
  }
}

async function saveCfToken() {
  if (!tokenValue.value) {
    ElMessage.warning(t('settings.cfTokenRequired'));
    return;
  }
  try {
    await apiPut('/api/super-admin/integrations/cloudflare/api-token', {
      type: 'api_token',
      value: tokenValue.value,
    });
    tokenValue.value = '';
    ElMessage.success(t('common.success'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.saveFailed'));
  }
}

async function removeCfToken() {
  try {
    await apiDelete('/api/super-admin/integrations/cloudflare/api-token');
    ElMessage.success(t('common.cleared'));
    usage.value = null;
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.deleteFailed'));
  }
}

async function queryUsage() {
  querying.value = true;
  try {
    usage.value = await apiPost('/api/admin/cloudflare/usage', {});
    ElMessage.success(t('settings.queryOk'));
  } catch (e) {
    ElMessage.error(e.message || t('home.queryFailed'));
  } finally {
    querying.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <el-card v-loading="loading" style="margin-bottom: 16px">
      <template #header>{{ t('cfUsage.credentialStatus') }}</template>
      <el-descriptions v-if="config" :column="1" border>
        <el-descriptions-item :label="t('settings.cfApiToken')">
          {{ config.cfUsage.apiTokenConfigured ? t('common.configured') : t('common.notConfigured') }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card style="margin-bottom: 16px">
      <template #header>{{ t('cfUsage.updateToken') }}</template>
      <p class="hint">{{ t('cfUsage.tokenHint') }}</p>
      <el-form label-position="top">
        <el-form-item :label="t('settings.cfApiToken')">
          <el-input v-model="tokenValue" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-button type="primary" @click="saveCfToken">{{ t('common.save') }}</el-button>
        <el-button @click="removeCfToken">{{ t('settings.clear') }}</el-button>
      </el-form>
    </el-card>

    <el-card>
      <template #header>{{ t('cfUsage.queryTitle') }}</template>
      <p class="hint">{{ t('cfUsage.queryHint') }}</p>
      <el-button type="primary" :loading="querying" @click="queryUsage">{{ t('cfUsage.queryButton') }}</el-button>

      <el-descriptions v-if="usage" :column="1" border style="margin-top: 16px">
        <el-descriptions-item :label="t('cfUsage.workersToday')">
          {{ usage.workersRequests24h ?? '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('cfUsage.pagesToday')">
          {{ usage.pagesRequests24h ?? '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('cfUsage.totalToday')">
          {{ usage.totalRequestsToday ?? '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('cfUsage.accounts')">
          <span v-for="a in usage.accounts" :key="a.id">{{ a.name }} </span>
        </el-descriptions-item>
        <el-descriptions-item :label="t('cfUsage.queriedAt')">{{ usage.queriedAt }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
  width: 100%;
}
.hint {
  color: #909399;
  font-size: 13px;
  margin: 0 0 12px;
}
@media (max-width: 640px) {
  .page {
    max-width: none;
  }

  :deep(.el-button + .el-button) {
    margin-left: 0;
  }

  :deep(.el-form .el-button) {
    margin: 4px 6px 4px 0;
  }
}
</style>

