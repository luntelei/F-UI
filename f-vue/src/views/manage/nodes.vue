<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api, apiDelete, apiPatch, apiPost } from '@/utils/api';
import { probeNodeLatency, resolveServiceDomain } from '@/utils/node-latency';
import { t } from '@/i18n';

const router = useRouter();
const loading = ref(false);
const nodes = ref([]);
const dialogVisible = ref(false);
const editing = ref(null);
const form = ref({
  name: '',
  type: 'vless_ws',
  proxyPath: '',
  enabled: true,
  sortOrder: 0,
  uuid: '',
  socks5Host: '',
  socks5Port: 1080,
  socks5User: '',
  socks5Password: '',
});

const typeLabel = {
  vless_ws: 'vless_ws',
  socks5_chain: 'socks5',
};

const testingAll = ref(false);
const latency = reactive({});
const domain = ref('');
let presenceTimer = null;

function latencyOf(id) {
  return latency[id] || { loading: false, ok: null, ms: null, detail: '' };
}

function applyLatencyResult(nodeId, result) {
  latency[nodeId] = {
    loading: false,
    ok: result.ok,
    ms: result.latencyMs ?? null,
    detail: result.detail || '',
  };
}

async function testOne(nodeId) {
  const node = nodes.value.find((n) => n.id === nodeId);
  if (!node) return;
  if (!domain.value) {
    ElMessage.warning(t('common.domainMissing'));
    return;
  }
  latency[nodeId] = { loading: true, ok: null, ms: null, detail: '' };
  const result = await probeNodeLatency(domain.value, node.proxyPath);
  applyLatencyResult(nodeId, result);
}

async function testAll() {
  if (!nodes.value.length) return;
  if (!domain.value) {
    ElMessage.warning(t('common.domainMissing'));
    return;
  }
  testingAll.value = true;
  let passed = 0;
  for (const node of nodes.value) {
    latency[node.id] = { loading: true, ok: null, ms: null, detail: '' };
    const result = await probeNodeLatency(domain.value, node.proxyPath);
    applyLatencyResult(node.id, result);
    if (result.ok) passed += 1;
  }
  ElMessage.success(t('nodes.testDone', { passed, total: nodes.value.length }));
  testingAll.value = false;
}

function resetForm() {
  form.value = {
    name: '',
    type: 'vless_ws',
    proxyPath: '',
    enabled: true,
    sortOrder: 0,
    uuid: '',
    upstream: '',
    socks5Host: '',
    socks5Port: 1080,
    socks5User: '',
    socks5Password: '',
  };
  editing.value = null;
}

async function load() {
  loading.value = true;
  try {
    nodes.value = await api('/api/super-admin/nodes');
  } catch (e) {
    ElMessage.error(e.message || t('common.loadFailed'));
    router.replace('/dashboard');
  } finally {
    loading.value = false;
  }
}

async function refreshPresence() {
  try {
    nodes.value = await api('/api/super-admin/nodes');
  } catch {
    /* 静默刷新在线状态。 */
  }
}

async function resetPresence(id) {
  try {
    await apiPost(`/api/super-admin/nodes/${id}/presence/reset`, {});
    ElMessage.success(t('nodes.presenceReset'));
    await refreshPresence();
  } catch (e) {
    ElMessage.error(e.message || t('common.resetFailed'));
  }
}

function openCreate() {
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row) {
  editing.value = row;
  form.value = {
    name: row.name,
    type: row.type,
    proxyPath: row.proxyPath,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    uuid: '',
    socks5Host: row.config?.socks5?.host || '',
    socks5Port: row.config?.socks5?.port || 1080,
    socks5User: row.config?.socks5?.username || '',
    socks5Password: '',
  };
  dialogVisible.value = true;
}

function buildPayload() {
  const config = {};
  if (form.value.type === 'vless_ws' || form.value.type === 'socks5_chain') {
    config.uuid = form.value.uuid;
  }
  if (form.value.type === 'socks5_chain') {
    config.socks5 = {
      host: form.value.socks5Host,
      port: Number(form.value.socks5Port) || 1080,
      username: form.value.socks5User || '',
      password: form.value.socks5Password || undefined,
    };
  }
  return {
    name: form.value.name,
    type: form.value.type,
    proxyPath: form.value.proxyPath,
    enabled: form.value.enabled,
    sortOrder: form.value.sortOrder,
    config,
  };
}

async function save() {
  try {
    const payload = buildPayload();
    if (editing.value) {
      await apiPatch(`/api/super-admin/nodes/${editing.value.id}`, payload);
      ElMessage.success(t('nodes.updated'));
    } else {
      await apiPost('/api/super-admin/nodes', payload);
      ElMessage.success(t('nodes.created'));
    }
    dialogVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.saveFailed'));
  }
}

async function remove(id) {
  try {
    await apiDelete(`/api/super-admin/nodes/${id}`);
    ElMessage.success(t('nodes.deleted'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.deleteFailed'));
  }
}

async function showLink(id) {
  try {
    const data = await apiPost(`/api/super-admin/nodes/${id}/link`, {});
    if (data.link?.vless) {
      await navigator.clipboard.writeText(data.link.vless);
      ElMessage.success(t('nodes.linkCopied'));
    } else {
      ElMessage.warning(t('nodes.linkError'));
    }
  } catch (e) {
    ElMessage.error(e.message || t('nodes.fetchFailed'));
  }
}

onMounted(async () => {
  domain.value = await resolveServiceDomain(api);
  load();
  presenceTimer = setInterval(refreshPresence, 10000);
});

onUnmounted(() => {
  if (presenceTimer) clearInterval(presenceTimer);
});
</script>

<template>
  <div v-loading="loading" class="page">
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">{{ t('common.add') }}</el-button>
      <el-button class="test-all-btn" :loading="testingAll" :disabled="!nodes.length" @click="testAll">
        <svg class="btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path
            d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2zm1 5h-2v6l5.25 3.15.75-1.23-4-2.42V7z"
          />
        </svg>
        {{ t('common.testAll') }}
      </el-button>
      <span class="toolbar-hint">{{ t('nodes.hint') }}</span>
    </div>

    <div v-if="!loading && !nodes.length" class="empty">{{ t('nodes.empty') }}</div>

    <div class="card-grid">
      <article v-for="row in nodes" :key="row.id" class="node-card">
        <header class="card-head">
          <div class="card-name">{{ row.name }}</div>
          <div class="card-type">{{ typeLabel[row.type] || row.type }}</div>
        </header>

        <dl class="card-meta">
          <div class="meta-row">
            <dt>{{ t('common.path') }}</dt>
            <dd>/{{ row.proxyPath }}</dd>
          </div>
          <div class="meta-row">
            <dt>{{ t('common.port') }}</dt>
            <dd>443</dd>
          </div>
          <div class="meta-row">
            <dt>{{ t('common.tls') }}</dt>
            <dd>{{ t('common.tlsOn') }}</dd>
          </div>
          <div class="meta-row">
            <dt>UUID</dt>
            <dd>{{ row.config?.uuidConfigured ? t('common.configured') : '-' }}</dd>
          </div>
          <div class="meta-row">
            <dt>{{ t('common.status') }}</dt>
            <dd>
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
                {{ row.enabled ? t('common.enabled') : t('common.disabled') }}
              </el-tag>
            </dd>
          </div>
          <div class="meta-row">
            <dt>{{ t('common.online') }}</dt>
            <dd class="online-dd">
              <template v-if="row.online">
                <el-tag type="success" size="small">{{ t('common.online') }}</el-tag>
                <span v-if="row.activeConnections > 1" class="conn-count">
                  {{ row.activeConnections }} {{ t('common.clients') }}
                </span>
              </template>
              <template v-else>
                <span class="offline">{{ t('common.offline') }}</span>
                <button
                  v-if="row.activeConnections > 0"
                  type="button"
                  class="reset-presence"
                  :title="t('nodes.resetPresenceTitle')"
                  @click="resetPresence(row.id)"
                >
                  {{ t('common.reset') }}
                </button>
              </template>
            </dd>
          </div>
          <div class="meta-row latency-row">
            <dt>{{ t('common.latency') }}</dt>
            <dd class="latency-dd">
              <button
                type="button"
                class="latency-btn"
                :class="{ spinning: latencyOf(row.id).loading }"
                :title="t('common.testLatency')"
                :disabled="latencyOf(row.id).loading || testingAll"
                @click="testOne(row.id)"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <path
                    d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2zm1 5h-2v6l5.25 3.15.75-1.23-4-2.42V7z"
                  />
                </svg>
              </button>
              <span v-if="latencyOf(row.id).loading" class="latency-pending">--</span>
              <span v-else-if="latencyOf(row.id).ok" class="latency-ok">{{ latencyOf(row.id).ms }} {{ t('common.ms') }}</span>
              <span v-else-if="latencyOf(row.id).ok === false" class="latency-fail" :title="latencyOf(row.id).detail">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                  />
                </svg>
              </span>
              <span v-else class="latency-idle">-</span>
            </dd>
          </div>
          <div v-if="row.type === 'socks5_chain'" class="meta-row">
            <dt>{{ t('nodes.upstream') }}</dt>
            <dd>{{ row.config?.socks5?.host || '-' }}</dd>
          </div>
        </dl>

        <footer class="card-foot">
          <button type="button" class="foot-btn" :title="t('common.edit')" @click="openEdit(row)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path
                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
              />
            </svg>
          </button>
          <button type="button" class="foot-btn" :title="t('common.copyLink')" @click="showLink(row.id)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path
                d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
              />
            </svg>
          </button>
          <button type="button" class="foot-btn danger" :title="t('common.delete')" @click="remove(row.id)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </button>
        </footer>
      </article>
    </div>

    <el-dialog v-model="dialogVisible" :title="editing ? t('nodes.editTitle') : t('nodes.addTitle')" width="520px">
      <el-form label-position="top">
        <el-form-item :label="t('nodes.name')">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('nodes.type')">
          <el-select v-model="form.type" style="width: 100%">
            <el-option :label="t('nodes.vlessWs')" value="vless_ws" />
            <el-option :label="t('nodes.socks5Chain')" value="socks5_chain" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('nodes.proxyPath')">
          <el-input v-model="form.proxyPath" :placeholder="t('nodes.proxyPathPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('nodes.uuid')">
          <el-input
            v-model="form.uuid"
            :placeholder="editing ? t('nodes.uuidEditPlaceholder') : t('nodes.uuidPlaceholder')"
          />
        </el-form-item>
        <template v-if="form.type === 'socks5_chain'">
          <el-form-item :label="t('nodes.socks5Host')">
            <el-input v-model="form.socks5Host" />
          </el-form-item>
          <el-form-item :label="t('nodes.socks5Port')">
            <el-input-number v-model="form.socks5Port" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item :label="t('nodes.socks5User')">
            <el-input v-model="form.socks5User" />
          </el-form-item>
          <el-form-item :label="t('nodes.socks5Password')">
            <el-input
              v-model="form.socks5Password"
              type="password"
              show-password
              :placeholder="t('nodes.socks5PasswordPlaceholder')"
            />
          </el-form-item>
        </template>
        <el-form-item :label="t('nodes.sortOrder')">
          <el-input-number v-model="form.sortOrder" :min="0" />
        </el-form-item>
        <el-form-item :label="t('common.enabled')">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}

.toolbar {
  margin-bottom: 16px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.test-all-btn {
  border-color: #67c23a;
  color: #67c23a;
}

.test-all-btn:hover,
.test-all-btn:focus {
  border-color: #85ce61;
  color: #85ce61;
  background: #f0f9eb;
}

.btn-icon {
  margin-right: 4px;
  vertical-align: -2px;
}

.toolbar-hint {
  color: #909399;
  font-size: 12px;
  align-self: center;
}

.empty {
  padding: 48px 16px;
  text-align: center;
  color: #909399;
  background: #fff;
  border-radius: 12px;
  border: 1px dashed #dcdfe6;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.node-card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #ebeef5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  min-height: 220px;
}

.card-head {
  padding: 16px 16px 8px;
}

.card-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.card-type {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.card-meta {
  margin: 0;
  padding: 8px 16px 12px;
  flex: 1;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px solid #f5f7fa;
}

.meta-row:last-child {
  border-bottom: none;
}

.meta-row dt {
  margin: 0;
  color: #909399;
}

.meta-row dd {
  margin: 0;
  color: #303133;
  text-align: right;
  word-break: break-all;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.latency-dd {
  min-height: 24px;
}

.latency-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #909399;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.latency-btn:hover:not(:disabled) {
  background: #f5f7fa;
  color: #409eff;
}

.latency-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.latency-btn.spinning svg {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.latency-ok {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  background: #f0f9eb;
  color: #67c23a;
  font-size: 12px;
  font-weight: 500;
}

.latency-fail {
  display: inline-flex;
  color: #f56c6c;
}

.latency-pending,
.latency-idle,
.offline {
  color: #909399;
  font-size: 12px;
}

.online-dd {
  gap: 8px;
}

.conn-count {
  color: #67c23a;
  font-size: 12px;
}

.reset-presence {
  border: none;
  background: none;
  color: #909399;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.reset-presence:hover {
  color: #409eff;
}

.offline {
  color: #f56c6c;
}

.card-foot {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 8px 12px 12px;
  border-top: 1px solid #f5f7fa;
}

.foot-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #606266;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.foot-btn:hover {
  background: #f5f7fa;
  color: #409eff;
}

.foot-btn.danger:hover {
  color: #f56c6c;
}

@media (max-width: 640px) {
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar .el-button {
    width: 100%;
    margin-left: 0;
  }

  .toolbar-hint {
    align-self: stretch;
  }

  .card-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .node-card {
    border-radius: 8px;
  }

  .meta-row {
    align-items: flex-start;
  }

  .meta-row dd {
    max-width: 62%;
  }

  :deep(.el-input-number) {
    width: 100%;
  }

  :deep(.el-dialog__footer) {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}
</style>

