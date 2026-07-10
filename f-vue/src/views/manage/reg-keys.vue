<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { t, locale } from '@/i18n';
import { api, apiDelete, apiPost } from '@/utils/api';

const router = useRouter();
const keys = ref([]);
const loading = ref(false);
const form = ref({ maxUses: 1, expireDays: 30 });
const visibleIds = ref(new Set());

async function load() {
  loading.value = true;
  try {
    keys.value = await api('/api/super-admin/invite-codes');
  } catch (e) {
    ElMessage.error(e.message || t('regKeys.noPermission'));
    router.replace('/dashboard');
  } finally {
    loading.value = false;
  }
}

function isVisible(id) {
  return visibleIds.value.has(id);
}

function toggleVisible(id) {
  const next = new Set(visibleIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  visibleIds.value = next;
}

function maskCode(code) {
  if (!code) return '';
  return '*'.repeat(String(code).length);
}

function formatExpireAt(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const lang = locale.value.startsWith('zh') ? 'zh-CN' : locale.value;
  return d.toLocaleString(lang, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function copyCode(code) {
  if (!code) return;
  await navigator.clipboard.writeText(String(code));
  ElMessage.success(t('regKeys.copied'));
}

async function createKey() {
  try {
    const row = await apiPost('/api/super-admin/invite-codes', form.value);
    await navigator.clipboard.writeText(String(row.code));
    ElMessage.success(t('regKeys.createdCopied'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('regKeys.createFailed'));
  }
}

async function removeKey(id) {
  try {
    await ElMessageBox.confirm(t('regKeys.deleteConfirmBody'), t('regKeys.deleteConfirmTitle'), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      confirmButtonClass: 'el-button--danger',
    });
    await apiDelete(`/api/super-admin/invite-codes/${id}`);
    ElMessage.success(t('regKeys.deleted'));
    await load();
  } catch (e) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e.message || t('regKeys.deleteFailed'));
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <el-card v-loading="loading">
      <template #header>{{ t('regKeys.createTitle') }}</template>
      <div class="create-toolbar">
        <label class="tool-field">
          <span>{{ t('regKeys.maxUses') }}</span>
          <el-input-number v-model="form.maxUses" :min="1" :max="100" size="small" controls-position="right" />
        </label>
        <label class="tool-field">
          <span>{{ t('regKeys.expireDays') }}</span>
          <el-input-number v-model="form.expireDays" :min="1" :max="365" size="small" controls-position="right" />
        </label>
        <el-button type="primary" class="generate-btn" @click="createKey">{{ t('regKeys.generate') }}</el-button>
      </div>

      <el-table :data="keys" style="margin-top: 16px">
        <el-table-column prop="code" :label="t('regKeys.code')" min-width="240">
          <template #default="{ row }">
            <div class="secret-field">
              <code class="secret-value">{{ isVisible(row.id) ? row.code : maskCode(row.code) }}</code>
              <button
                type="button"
                class="icon-btn"
                :title="isVisible(row.id) ? t('regKeys.hideCode') : t('regKeys.showCode')"
                @click="toggleVisible(row.id)"
              >
                <svg v-if="isVisible(row.id)" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <path
                    d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
                  />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <path
                    d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                  />
                </svg>
              </button>
              <button type="button" class="icon-btn" :title="t('common.copy')" @click="copyCode(row.code)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <path
                    d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                  />
                </svg>
              </button>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="useCount" :label="t('regKeys.used')" width="80" align="center" />
        <el-table-column prop="maxUses" :label="t('regKeys.limit')" width="80" align="center" />
        <el-table-column
          prop="expireAt"
          :label="t('regKeys.expireAt')"
          class-name="col-expire"
          label-class-name="col-expire"
          min-width="180"
        >
          <template #default="{ row }">
            <span class="expire-at">{{ formatExpireAt(row.expireAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('dashboard.actions')" width="84" align="center">
          <template #default="{ row }">
            <button type="button" class="icon-btn danger" :title="t('common.delete')" @click="removeKey(row.id)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4h-3.5z" />
              </svg>
            </button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  max-width: 1100px;
  width: 100%;
}
.create-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 18px;
  padding: 2px 0 8px;
}
.tool-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #606266;
  font-size: 13px;
}
.tool-field :deep(.el-input-number) {
  width: 104px;
}
.generate-btn {
  margin-left: 4px;
  min-width: 72px;
}
.secret-field {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.secret-value {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  color: #606266;
  letter-spacing: 0.04em;
  word-break: break-all;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #909399;
  cursor: pointer;
  flex-shrink: 0;
}
.icon-btn:hover {
  color: #409eff;
  background: #ecf5ff;
}
.icon-btn.danger:hover {
  color: #f56c6c;
  background: #fef0f0;
}
:deep(.col-expire .cell) {
  white-space: nowrap;
}
.expire-at {
  white-space: nowrap;
}
@media (max-width: 640px) {
  .create-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .tool-field {
    align-items: stretch;
    flex-direction: column;
    gap: 6px;
  }

  .tool-field :deep(.el-input-number),
  .generate-btn {
    width: 100%;
  }

  .secret-value {
    font-size: 12px;
  }
}
</style>

