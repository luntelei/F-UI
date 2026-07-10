<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';
import { t } from '@/i18n';
import { api, apiPost, clearToken } from '@/utils/api';

const router = useRouter();
const loading = ref(true);
const data = ref(null);
const rotating = ref(false);

onMounted(async () => {
  try {
    data.value = await api('/api/account/subscription');
  } catch (e) {
    ElMessage.error(e.message || t('common.loadFailed'));
    clearToken();
    router.replace('/login');
  } finally {
    loading.value = false;
  }
});

function subUrlWithTarget(target) {
  if (!data.value?.subUrl) return '';
  const url = new URL(data.value.subUrl);
  url.searchParams.set('target', target);
  return url.toString();
}

async function copyText(text) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  ElMessage.success(t('dashboard.copied'));
}

async function rotateSub() {
  try {
    await ElMessageBox.confirm(t('dashboard.rotateConfirm'), t('dashboard.rotateTitle'), {
      type: 'warning',
      confirmButtonText: t('dashboard.rotateBtn'),
      cancelButtonText: t('common.cancel'),
    });
  } catch {
    return;
  }
  rotating.value = true;
  try {
    const res = await apiPost('/api/account/subscription/rotate-token', {});
    data.value = { ...data.value, subUrl: res.subUrl };
    ElMessage.success(t('dashboard.rotated'));
  } catch (e) {
    ElMessage.error(e.message || t('dashboard.rotateFailed'));
  } finally {
    rotating.value = false;
  }
}

async function logout() {
  try {
    await api('/api/account/session/logout', { method: 'POST', body: '{}' });
  } catch {
    /* ignore */
  }
  clearToken();
  router.replace('/login');
}
</script>

<template>
  <div class="page">
    <div class="page-top">
      <LanguageSwitcher />
    </div>
    <el-card v-loading="loading">
      <template #header>
        <div class="header">
          <span>{{ t('dashboard.title') }}</span>
          <div>
            <el-button v-if="data?.user?.role === 'admin'" link type="primary" @click="router.push('/manage/free-quota')">
              {{ t('dashboard.console') }}
            </el-button>
            <el-button link type="danger" @click="logout">{{ t('dashboard.logout') }}</el-button>
          </div>
        </div>
      </template>

      <el-descriptions v-if="data" :column="1" border>
        <el-descriptions-item :label="t('dashboard.email')">{{ data.user.email }}</el-descriptions-item>
        <el-descriptions-item :label="t('dashboard.role')">{{ data.user.role }}</el-descriptions-item>
        <el-descriptions-item :label="t('dashboard.subUrl')">
          <el-input :model-value="data.subUrl" readonly>
            <template #append>
              <el-button @click="copyText(data.subUrl)">{{ t('common.copy') }}</el-button>
            </template>
          </el-input>
        </el-descriptions-item>
        <el-descriptions-item label="Clash">
          <el-input :model-value="subUrlWithTarget('clash')" readonly>
            <template #append>
              <el-button @click="copyText(subUrlWithTarget('clash'))">{{ t('common.copy') }}</el-button>
            </template>
          </el-input>
        </el-descriptions-item>
        <el-descriptions-item label="Sing-box">
          <el-input :model-value="subUrlWithTarget('sing-box')" readonly>
            <template #append>
              <el-button @click="copyText(subUrlWithTarget('sing-box'))">{{ t('common.copy') }}</el-button>
            </template>
          </el-input>
        </el-descriptions-item>
        <el-descriptions-item :label="t('dashboard.actions')">
          <el-button type="warning" :loading="rotating" @click="rotateSub">{{ t('dashboard.rotateSub') }}</el-button>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
  margin: 40px auto;
  padding: 0 16px;
}
.page-top {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.header > div {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}
:deep(.el-input-group__append) {
  padding: 0;
}
:deep(.el-input-group__append .el-button) {
  margin: 0;
}
@media (max-width: 640px) {
  .page {
    margin: 0;
    padding: 12px;
    max-width: none;
  }

  .header {
    align-items: flex-start;
    flex-direction: column;
  }

  :deep(.el-descriptions__cell) {
    display: block;
    width: 100% !important;
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
  }
}
</style>

