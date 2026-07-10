<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { t } from '@/i18n';
import { api } from '@/utils/api';

const router = useRouter();
const loading = ref(false);
const logs = ref([]);
const limit = ref(50);

const tableMaxHeight = computed(() => Math.max(420, window.innerHeight - 230));

const AUDIT_ACTION_RULES = [
  { method: 'POST', path: '/api/auth/login', ok: 'logs.actions.login', fail: 'logs.actions.loginFailed' },
  { method: 'POST', path: '/api/auth/register', ok: 'logs.actions.register', fail: 'logs.actions.registerFailed' },
  { method: 'POST', path: '/api/account/session/logout', ok: 'logs.actions.logout' },
  { method: 'POST', path: '/api/account/subscription/rotate-token', ok: 'logs.actions.rotateSub' },
  { method: 'GET', prefix: '/sub/', ok: 'logs.actions.fetchSub', fail: 'logs.actions.fetchSubFailed' },
  { method: 'POST', path: '/api/super-admin/nodes', ok: 'logs.actions.nodeAdd', fail: 'logs.actions.nodeAddFailed' },
  { method: 'PATCH', pattern: /^\/api\/super-admin\/nodes\/[^/]+$/, ok: 'logs.actions.nodeUpdate', fail: 'logs.actions.nodeUpdateFailed' },
  { method: 'DELETE', pattern: /^\/api\/super-admin\/nodes\/[^/]+$/, ok: 'logs.actions.nodeDelete', fail: 'logs.actions.nodeDeleteFailed' },
  { method: 'POST', pattern: /^\/api\/super-admin\/nodes\/[^/]+\/link$/, ok: 'logs.actions.nodeLink' },
  { method: 'POST', pattern: /^\/api\/super-admin\/nodes\/[^/]+\/presence\/reset$/, ok: 'logs.actions.nodeResetPresence' },
  { method: 'PATCH', pattern: /^\/api\/super-admin\/users\/[^/]+$/, ok: 'logs.actions.userUpdate', fail: 'logs.actions.userUpdateFailed' },
  { method: 'POST', path: '/api/super-admin/invite-codes', ok: 'logs.actions.regKeyAdd', fail: 'logs.actions.regKeyAddFailed' },
  { method: 'DELETE', pattern: /^\/api\/super-admin\/invite-codes\/[^/]+$/, ok: 'logs.actions.regKeyDelete', fail: 'logs.actions.regKeyDeleteFailed' },
  { method: 'PUT', path: '/api/super-admin/integrations/cloudflare/api-token', ok: 'logs.actions.cfTokenSave', fail: 'logs.actions.cfTokenSaveFailed' },
  { method: 'DELETE', path: '/api/super-admin/integrations/cloudflare/api-token', ok: 'logs.actions.cfTokenDelete' },
  { method: 'PUT', path: '/api/super-admin/integrations/telegram/bot-token', ok: 'logs.actions.tgBotSave', fail: 'logs.actions.tgBotSaveFailed' },
  { method: 'DELETE', path: '/api/super-admin/integrations/telegram/bot-token', ok: 'logs.actions.tgBotDelete' },
  { method: 'PUT', path: '/api/super-admin/integrations/telegram/chat', ok: 'logs.actions.tgChatSave', fail: 'logs.actions.tgChatSaveFailed' },
  { method: 'DELETE', path: '/api/super-admin/integrations/telegram/chat', ok: 'logs.actions.tgChatDelete' },
  { method: 'PATCH', path: '/api/super-admin/security/turnstile', ok: 'logs.actions.turnstileUpdate', fail: 'logs.actions.turnstileUpdateFailed' },
  { method: 'PATCH', path: '/api/super-admin/announcement', ok: 'logs.actions.announcementUpdate', fail: 'logs.actions.announcementUpdateFailed' },
  { method: 'POST', path: '/api/super-admin/integrations/telegram/test', ok: 'logs.actions.tgTest', fail: 'logs.actions.tgTestFailed' },
  { method: 'PATCH', path: '/api/admin/subscription-converter/settings', ok: 'logs.actions.subConverterUpdate', fail: 'logs.actions.subConverterUpdateFailed' },
  { method: 'POST', path: '/api/super-admin/best-ip/refresh', ok: 'logs.actions.bestRefresh', fail: 'logs.actions.bestRefreshFailed' },
  { method: 'POST', path: '/api/super-admin/best-ip/access-tokens', ok: 'logs.actions.bestToken', fail: 'logs.actions.bestTokenFailed' },
  { method: 'PATCH', path: '/api/super-admin/best-ip/settings', ok: 'logs.actions.bestSettings', fail: 'logs.actions.bestSettingsFailed' },
  { method: 'POST', path: '/api/admin/cloudflare/usage', ok: 'logs.actions.cfUsage', fail: 'logs.actions.cfUsageFailed' },
];

const METHOD_ACTION_KEYS = {
  GET: 'logs.actions.requestGet',
  POST: 'logs.actions.requestPost',
  PUT: 'logs.actions.requestPut',
  PATCH: 'logs.actions.requestPut',
  DELETE: 'logs.actions.requestDelete',
};

function formatBeijingTime(value) {
  if (!value) return '-';
  const normalized = String(value).includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date).replace(/\//g, '-');
}

function cleanPath(value) {
  const raw = String(value || '');
  return raw.split('?')[0];
}

function fallbackAuditAction(row) {
  const action = String(row.action || '').trim();
  const match = action.match(/^([A-Z]+)\s+(.+)$/);
  const method = String(row.method || match?.[1] || '').toUpperCase();
  const path = cleanPath(row.pathRedacted || match?.[2]);
  if (!method && !path) return '';

  return t(METHOD_ACTION_KEYS[method] || 'logs.actions.requestOther', {
    method: method || '-',
    path: path || '-',
  });
}

function localizeAuditAction(row) {
  const directAction = String(row.action || '').trim();
  if (directAction.startsWith('logs.actions.')) {
    return t(directAction);
  }

  const path = cleanPath(row.pathRedacted);
  const method = String(row.method || '').toUpperCase();
  const failed = Number(row.status) >= 400;
  const rule = AUDIT_ACTION_RULES.find((item) => {
    if (item.method && item.method !== method) return false;
    if (item.path) return path === item.path;
    if (item.prefix) return path.startsWith(item.prefix);
    if (item.pattern) return item.pattern.test(path);
    return false;
  });
  if (!rule) {
    return fallbackAuditAction(row) || '-';
  }
  return t((failed && rule.fail) || rule.ok);
}

async function load() {
  loading.value = true;
  try {
    logs.value = await api(`/api/super-admin/audit-logs?limit=${limit.value}`);
  } catch (e) {
    ElMessage.error(e.message || t('common.permissionDenied'));
    router.replace('/dashboard');
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <el-card v-loading="loading" class="log-card">
      <template #header>
        <div class="header">
          <span class="title">{{ t('logs.title') }}</span>
          <el-select v-model="limit" class="limit-select" @change="load">
            <el-option :value="30" :label="t('logs.rows', { count: 30 })" />
            <el-option :value="50" :label="t('logs.rows', { count: 50 })" />
            <el-option :value="100" :label="t('logs.rows', { count: 100 })" />
          </el-select>
        </div>
      </template>
      <el-table :data="logs" size="small" :max-height="tableMaxHeight" border>
        <el-table-column :label="t('logs.time')" min-width="170">
          <template #default="{ row }">
            {{ formatBeijingTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="operator" :label="t('logs.operator')" min-width="190" show-overflow-tooltip />
        <el-table-column prop="ip" label="IP" min-width="135" show-overflow-tooltip />
        <el-table-column :label="t('logs.region')" min-width="95">
          <template #default="{ row }">
            {{ row.country || '-' }}<span v-if="row.colo"> / {{ row.colo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="ASN" min-width="210" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.asn">AS{{ row.asn }}</span>
            <span v-if="row.asOrganization"> {{ row.asOrganization }}</span>
            <span v-if="!row.asn && !row.asOrganization">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="action" :label="t('logs.action')" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="row.status >= 400 ? 'danger' : row.pathRedacted?.startsWith('/sub/') ? 'success' : 'warning'"
            >
              {{ localizeAuditAction(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="pathRedacted" label="URL" min-width="300" show-overflow-tooltip />
        <el-table-column prop="status" :label="t('logs.status')" width="75" />
        <el-table-column prop="userAgent" label="UA" min-width="260" show-overflow-tooltip />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  max-width: none;
}
.log-card {
  border-radius: 8px;
}
.title {
  font-size: 18px;
  font-weight: 700;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.limit-select {
  width: 120px;
}
@media (max-width: 640px) {
  .header {
    align-items: stretch;
    flex-direction: column;
  }

  .limit-select {
    width: 100%;
  }
}
</style>

