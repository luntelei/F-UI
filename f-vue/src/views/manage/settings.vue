<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { t } from '@/i18n';
import { api, apiDelete, apiPatch, apiPost, apiPut } from '@/utils/api';
import AnnouncementNotice from '@/components/AnnouncementNotice.vue';

const router = useRouter();
const loading = ref(false);
const config = ref(null);

const cfDialog = ref(false);
const tgDialog = ref(false);
const turnstileSiteDialog = ref(false);
const turnstileSecretDialog = ref(false);
const announcementDialog = ref(false);

const cfToken = ref('');
const querying = ref(false);
const usage = ref(null);

const tgBotToken = ref('');
const tgChatId = ref('');
const tgSending = ref(false);

const turnstileSiteKey = ref('');
const turnstileSecretKey = ref('');
const announcementForm = ref({
  enabled: false,
  title: '',
  content: '',
  icon: 'none',
  position: 'top-right',
  width: 340,
  offset: 24,
  duration: 0,
});
const announcementPreview = ref(null);
const canEditSystemSettings = computed(() => config.value?.isSuperAdmin === true);

const turnstileRegister = computed({
  get: () => config.value?.turnstile?.registerEnabled ?? false,
  set: (v) => patchTurnstile({ registerEnabled: v }),
});

const turnstileLogin = computed({
  get: () => config.value?.turnstile?.loginEnabled ?? false,
  set: (v) => patchTurnstile({ loginEnabled: v }),
});

async function load() {
  loading.value = true;
  try {
    config.value = await api('/api/admin/settings');
    announcementForm.value = {
      enabled: config.value?.announcement?.enabled ?? false,
      title: config.value?.announcement?.title || '',
      content: config.value?.announcement?.content || '',
      icon: config.value?.announcement?.icon || 'none',
      position: config.value?.announcement?.position || 'top-right',
      width: config.value?.announcement?.width ?? 340,
      offset: config.value?.announcement?.offset ?? 24,
      duration: config.value?.announcement?.duration ?? 0,
    };
  } catch (e) {
    ElMessage.error(e.message || t('common.failed'));
    router.replace('/dashboard');
  } finally {
    loading.value = false;
  }
}

async function patchTurnstile(body) {
  if (!canEditSystemSettings.value) {
    return ElMessage.warning(t('settings.superAdminOnly'));
  }
  try {
    const data = await apiPatch('/api/super-admin/security/turnstile', body);
    if (config.value) config.value.turnstile = data;
    ElMessage.success(t('common.success'));
    return data;
  } catch (e) {
    await ElMessageBox.alert(turnstileFailureMessage(e), t('settings.turnstileCheckFailed'), {
      confirmButtonText: t('common.ok'),
      type: 'warning',
    });
    await load();
    throw e;
  }
}

function turnstileFailureMessage(e) {
  const message = e?.message || t('common.failed');
  const normalized = message.toLowerCase();
  const hints = [];

  if (normalized.includes('site key')) {
    hints.push(t('settings.turnstileSiteKeyHint'));
  }
  if (normalized.includes('secret key')) {
    hints.push(t('settings.turnstileSecretKeyHint'));
  }
  if (!hints.length && normalized.includes('turnstile')) {
    hints.push(t('settings.turnstileHint'));
  }

  return [...new Set([message, ...hints])].join('\n\n');
}

async function patchAnnouncement(body) {
  if (!canEditSystemSettings.value) {
    return ElMessage.warning(t('settings.superAdminOnly'));
  }
  try {
    const data = await apiPatch('/api/super-admin/announcement', body);
    if (config.value) config.value.announcement = data;
    ElMessage.success(t('common.success'));
  } catch (e) {
    ElMessage.error(e.message || t('common.failed'));
    await load();
  }
}

async function saveCfToken() {
  if (!canEditSystemSettings.value) return ElMessage.warning(t('settings.superAdminOnly'));
  if (!cfToken.value) return ElMessage.warning(t('settings.cfTokenRequired'));
  try {
    await apiPut('/api/super-admin/integrations/cloudflare/api-token', { type: 'api_token', value: cfToken.value });
    cfToken.value = '';
    ElMessage.success(t('common.success'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.failed'));
  }
}

async function clearCfToken() {
  if (!canEditSystemSettings.value) return ElMessage.warning(t('settings.superAdminOnly'));
  try {
    await apiDelete('/api/super-admin/integrations/cloudflare/api-token');
    usage.value = null;
    ElMessage.success(t('common.success'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.failed'));
  }
}

async function queryUsage() {
  querying.value = true;
  try {
    usage.value = await apiPost('/api/admin/cloudflare/usage', {});
    ElMessage.success(t('settings.queryOk'));
  } catch (e) {
    ElMessage.error(e.message || t('common.failed'));
  } finally {
    querying.value = false;
  }
}

async function saveTgBot() {
  if (!canEditSystemSettings.value) return ElMessage.warning(t('settings.superAdminOnly'));
  if (!tgBotToken.value) return ElMessage.warning(t('settings.tgTokenRequired'));
  try {
    await apiPut('/api/super-admin/integrations/telegram/bot-token', { botToken: tgBotToken.value });
    tgBotToken.value = '';
    ElMessage.success(t('common.success'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.failed'));
  }
}

async function saveTgChat() {
  if (!canEditSystemSettings.value) return ElMessage.warning(t('settings.superAdminOnly'));
  if (!tgChatId.value) return ElMessage.warning(t('settings.tgChatRequired'));
  try {
    await apiPut('/api/super-admin/integrations/telegram/chat', { chatId: tgChatId.value });
    tgChatId.value = '';
    ElMessage.success(t('common.success'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.failed'));
  }
}

async function clearTgBot() {
  if (!canEditSystemSettings.value) return ElMessage.warning(t('settings.superAdminOnly'));
  try {
    await apiDelete('/api/super-admin/integrations/telegram/bot-token');
    ElMessage.success(t('common.success'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.failed'));
  }
}

async function clearTgChat() {
  if (!canEditSystemSettings.value) return ElMessage.warning(t('settings.superAdminOnly'));
  try {
    await apiDelete('/api/super-admin/integrations/telegram/chat');
    ElMessage.success(t('common.success'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.failed'));
  }
}

async function sendTgTest() {
  if (!canEditSystemSettings.value) return ElMessage.warning(t('settings.superAdminOnly'));
  tgSending.value = true;
  try {
    await apiPost('/api/super-admin/integrations/telegram/test', {});
    ElMessage.success(t('settings.tgTestOk'));
  } catch (e) {
    ElMessage.error(e.message || t('common.failed'));
  } finally {
    tgSending.value = false;
  }
}

async function saveTurnstileSiteKey() {
  try {
    await patchTurnstile({ siteKey: turnstileSiteKey.value });
    turnstileSiteKey.value = '';
    turnstileSiteDialog.value = false;
    await load();
  } catch {
    /* 具体错误由 patchTurnstile 统一提示。 */
  }
}

async function saveTurnstileSecretKey() {
  try {
    await patchTurnstile({ secretKey: turnstileSecretKey.value });
    turnstileSecretKey.value = '';
    turnstileSecretDialog.value = false;
    await load();
  } catch {
    /* 具体错误由 patchTurnstile 统一提示。 */
  }
}

async function saveAnnouncement() {
  try {
    await patchAnnouncement({ ...announcementForm.value });
    announcementDialog.value = false;
    await load();
  } catch {
    /* 具体错误由 patchAnnouncement 统一提示。 */
  }
}

function previewAnnouncement() {
  announcementPreview.value = {
    enabled: true,
    title: announcementForm.value.title || t('settings.announcementTitle'),
    content: announcementForm.value.content || t('settings.announcementPreviewPh'),
    icon: announcementForm.value.icon,
    position: announcementForm.value.position,
    width: announcementForm.value.width,
    offset: announcementForm.value.offset,
    duration: announcementForm.value.duration,
  };
}

function closePreview() {
  announcementPreview.value = null;
}

function boolLabel(v) {
  return v ? t('common.enabled') : t('common.disabled');
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="settings-page">
    <div class="settings-grid">
      <!-- CF 用量 -->
      <section v-if="canEditSystemSettings" class="setting-card">
        <header class="card-head">
          <h2>{{ t('settings.cfTitle') }}</h2>
          <el-button type="primary" link :disabled="!canEditSystemSettings" @click="cfDialog = true">{{ t('common.edit') }}</el-button>
        </header>
        <dl class="card-rows">
          <div class="row">
            <dt>{{ t('settings.cfApiToken') }}</dt>
            <dd>{{ boolLabel(config?.cfUsage?.apiTokenConfigured) }}</dd>
          </div>
        </dl>
      </section>

      <!-- TG 通知 -->
      <section v-if="canEditSystemSettings" class="setting-card">
        <header class="card-head">
          <h2>{{ t('settings.tgTitle') }}</h2>
          <el-button type="primary" link :disabled="!canEditSystemSettings" @click="tgDialog = true">{{ t('common.edit') }}</el-button>
        </header>
        <dl class="card-rows">
          <div class="row">
            <dt>{{ t('settings.tgBotToken') }}</dt>
            <dd>{{ boolLabel(config?.notify?.telegramBotConfigured) }}</dd>
          </div>
          <div class="row">
            <dt>{{ t('settings.tgChatId') }}</dt>
            <dd>{{ boolLabel(config?.notify?.telegramChatConfigured) }}</dd>
          </div>
        </dl>
      </section>

      <!-- Turnstile -->
      <section v-if="canEditSystemSettings" class="setting-card">
        <header class="card-head">
          <h2>{{ t('settings.turnstileTitle') }}</h2>
        </header>
        <dl class="card-rows">
          <div class="row">
            <dt>{{ t('settings.turnstileRegister') }}</dt>
            <dd>
              <el-switch v-model="turnstileRegister" :disabled="loading || !canEditSystemSettings" />
            </dd>
          </div>
          <div class="row">
            <dt>{{ t('settings.turnstileLogin') }}</dt>
            <dd>
              <el-switch v-model="turnstileLogin" :disabled="loading || !canEditSystemSettings" />
            </dd>
          </div>
          <div class="row">
            <dt>Site Key</dt>
            <dd class="row-action">
              <span>{{ config?.turnstile?.siteKeyPreview || t('settings.notConfigured') }}</span>
              <el-button size="small" :disabled="!canEditSystemSettings" @click="turnstileSiteDialog = true">{{ t('common.edit') }}</el-button>
            </dd>
          </div>
          <div class="row">
            <dt>Secret Key</dt>
            <dd class="row-action">
              <span>{{ boolLabel(config?.turnstile?.secretConfigured) }}</span>
              <el-button size="small" :disabled="!canEditSystemSettings" @click="turnstileSecretDialog = true">{{ t('common.edit') }}</el-button>
            </dd>
          </div>
        </dl>
      </section>

      <!-- 网站公告 -->
      <section v-if="canEditSystemSettings" class="setting-card">
        <header class="card-head">
          <h2>{{ t('settings.announcementTitle') }}</h2>
        </header>
        <dl class="card-rows">
          <div class="row">
            <dt>{{ t('settings.postLoginNotice') }}</dt>
            <dd class="row-action">
              <span>{{ boolLabel(config?.announcement?.enabled) }}</span>
              <el-button size="small" :disabled="!canEditSystemSettings" @click="announcementDialog = true">{{ t('settings.configure') }}</el-button>
            </dd>
          </div>
        </dl>
      </section>

      <!-- 关于 -->
      <section class="setting-card about-card">
        <header class="card-head">
          <h2>{{ t('settings.aboutTitle') }}</h2>
        </header>
        <dl class="card-rows">
          <div class="row">
            <dt>{{ t('settings.version') }}</dt>
            <dd>
              <span class="about-value">
                <span class="version-icon" aria-hidden="true">v</span>
                <span>v{{ config?.about?.version || '1.0.0' }}</span>
              </span>
            </dd>
          </div>
          <div class="row">
            <dt>{{ t('settings.community') }}</dt>
            <dd>
              <a
                class="about-link"
                :href="config?.about?.community?.url || 'https://github.com/luntelei/F-UI'"
                :aria-label="config?.about?.community?.label || 'luntelei/F-UI'"
                :title="config?.about?.community?.label || 'luntelei/F-UI'"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  class="site-icon"
                  :src="config?.about?.community?.icon || 'https://github.githubassets.com/favicons/favicon.svg'"
                  alt=""
                  loading="lazy"
                />
              </a>
            </dd>
          </div>
          <div class="row">
            <dt>{{ t('settings.help') }}</dt>
            <dd>
              <a
                class="about-link"
                :href="config?.about?.help?.url || 'https://developers.cloudflare.com'"
                :aria-label="config?.about?.help?.label || 'developers.cloudflare.com'"
                :title="config?.about?.help?.label || 'developers.cloudflare.com'"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  class="site-icon"
                  :src="config?.about?.help?.icon || '/icons/cloudflare-docs.png'"
                  alt=""
                  loading="lazy"
                />
              </a>
            </dd>
          </div>
        </dl>
      </section>
    </div>

    <!-- CF 用量对话框 -->
    <el-dialog v-model="cfDialog" :title="t('settings.cfTitle')" width="520px" destroy-on-close>
      <p class="hint">{{ t('settings.cfHint') }}</p>
      <el-form label-position="top">
        <el-form-item :label="t('settings.cfApiToken')">
          <el-input v-model="cfToken" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-button type="primary" :disabled="!canEditSystemSettings" @click="saveCfToken">{{ t('common.save') }}</el-button>
        <el-button :disabled="!canEditSystemSettings" @click="clearCfToken">{{ t('settings.clear') }}</el-button>
        <el-button :loading="querying" @click="queryUsage">{{ t('settings.queryUsage') }}</el-button>
      </el-form>
      <el-descriptions v-if="usage" :column="1" border size="small" style="margin-top: 16px">
        <el-descriptions-item label="Workers">{{ usage.workersRequests24h ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="Pages">{{ usage.pagesRequests24h ?? '-' }}</el-descriptions-item>
        <el-descriptions-item :label="t('settings.totalToday')">{{ usage.totalRequestsToday ?? '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <!-- TG 对话框 -->
    <el-dialog v-model="tgDialog" :title="t('settings.tgTitle')" width="520px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item :label="t('settings.tgBotToken')">
          <el-input v-model="tgBotToken" type="password" show-password :placeholder="t('common.saveNoEcho')" />
        </el-form-item>
        <el-form-item :label="t('settings.tgChatId')">
          <el-input v-model="tgChatId" placeholder="-1001234567890" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="!canEditSystemSettings" @click="clearTgBot">{{ t('settings.clearBot') }}</el-button>
        <el-button :disabled="!canEditSystemSettings" @click="clearTgChat">{{ t('settings.clearChat') }}</el-button>
        <el-button type="primary" :disabled="!canEditSystemSettings" @click="saveTgBot">{{ t('settings.saveBot') }}</el-button>
        <el-button type="primary" :disabled="!canEditSystemSettings" @click="saveTgChat">{{ t('settings.saveChat') }}</el-button>
        <el-button :loading="tgSending" :disabled="!canEditSystemSettings" @click="sendTgTest">{{ t('settings.tgTest') }}</el-button>
      </template>
    </el-dialog>

    <!-- Turnstile Site Key -->
    <el-dialog v-model="turnstileSiteDialog" title="Site Key" width="520px" destroy-on-close>
      <p class="dialog-hint">{{ t('settings.turnstileSiteKeyHint') }}</p>
      <el-input v-model="turnstileSiteKey" placeholder="0x4AAAAA..." />
      <template #footer>
        <el-button @click="turnstileSiteDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="!canEditSystemSettings" @click="saveTurnstileSiteKey">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- Turnstile Secret Key -->
    <el-dialog v-model="turnstileSecretDialog" title="Secret Key" width="520px" destroy-on-close>
      <p class="dialog-hint">{{ t('settings.turnstileSecretKeyHint') }}</p>
      <el-input v-model="turnstileSecretKey" type="password" show-password :placeholder="t('common.saveNoEcho')" />
      <template #footer>
        <el-button @click="turnstileSecretDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="!canEditSystemSettings" @click="saveTurnstileSecretKey">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 公告 -->
    <el-dialog
      v-model="announcementDialog"
      :title="t('settings.postLoginNotice')"
      width="640px"
      destroy-on-close
      @closed="closePreview"
    >
      <el-form label-position="top">
        <el-form-item :label="t('settings.announcementTitleLabel')">
          <el-input v-model="announcementForm.title" :placeholder="t('settings.announcementTitlePh')" />
        </el-form-item>
        <div class="ann-grid">
          <el-form-item :label="t('settings.announcementIcon')">
            <el-select v-model="announcementForm.icon" style="width: 100%">
              <el-option :label="t('settings.iconNone')" value="none" />
              <el-option :label="t('settings.iconInfo')" value="info" />
              <el-option :label="t('settings.iconSuccess')" value="success" />
              <el-option :label="t('settings.iconWarning')" value="warning" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('settings.announcementPosition')">
            <el-select v-model="announcementForm.position" style="width: 100%">
              <el-option :label="t('settings.posTopRight')" value="top-right" />
              <el-option :label="t('settings.posTopLeft')" value="top-left" />
              <el-option :label="t('settings.posBottomRight')" value="bottom-right" />
              <el-option :label="t('settings.posBottomLeft')" value="bottom-left" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('settings.announcementWidth')">
            <el-input-number v-model="announcementForm.width" :min="240" :max="600" :step="10" />
          </el-form-item>
          <el-form-item :label="t('settings.announcementOffset')">
            <el-input-number v-model="announcementForm.offset" :min="0" :max="200" :step="4" />
          </el-form-item>
        </div>
        <p class="hint">{{ t('settings.announcementDurationHint') }}</p>
        <el-form-item :label="t('settings.announcementContentLabel')">
          <el-input
            v-model="announcementForm.content"
            type="textarea"
            :rows="6"
            :placeholder="t('settings.announcementContentPh')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="ann-dialog-footer">
          <el-switch
            v-model="announcementForm.enabled"
            :active-text="t('common.enabled')"
            :inactive-text="t('common.disabled')"
          />
          <div class="ann-dialog-actions">
            <el-button @click="previewAnnouncement">{{ t('settings.preview') }}</el-button>
            <el-button @click="announcementDialog = false">{{ t('common.cancel') }}</el-button>
            <el-button type="primary" :disabled="!canEditSystemSettings" @click="saveAnnouncement">{{ t('common.save') }}</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <AnnouncementNotice v-if="announcementPreview" :preview="announcementPreview" @close="closePreview" />
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 1100px;
  width: 100%;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.setting-card {
  background: #fff;
  border: 1px solid #e8eaed;
  border-radius: 12px;
  padding: 18px 20px 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.about-card {
  grid-column: span 1;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
}

.card-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.card-rows {
  margin: 0;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f5f7fa;
}

.row:last-child {
  border-bottom: none;
}

.row dt {
  margin: 0;
  font-size: 13px;
  color: #909399;
  flex-shrink: 0;
}

.row dd {
  margin: 0;
  font-size: 14px;
  color: #303133;
  text-align: right;
}

.row-action {
  display: flex;
  align-items: center;
  gap: 8px;
}

.link-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.link-row a,
.row a {
  color: #409eff;
  text-decoration: none;
  font-size: 13px;
}

.about-value,
.about-link {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  min-height: 20px;
}

.about-link {
  width: 28px;
  height: 28px;
  justify-content: center;
  color: #409eff;
  border-radius: 6px;
  transition: background-color 0.15s ease, transform 0.15s ease;
}

.about-link:hover {
  background: #f5f7fa;
  transform: translateY(-1px);
}

.site-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  border-radius: 3px;
  object-fit: contain;
}

.version-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: #ecf5ff;
  color: #337ecc;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.link-row a:hover,
.row a:hover {
  text-decoration: underline;
}

.hint {
  color: #909399;
  font-size: 13px;
  margin: 0 0 12px;
}

.dialog-hint {
  color: #909399;
  font-size: 13px;
  line-height: 1.65;
  margin: 0 0 14px;
}

.ann-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.ann-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.ann-dialog-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 760px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .setting-card {
    border-radius: 8px;
    padding: 16px 14px;
  }

  .card-head {
    align-items: flex-start;
    gap: 10px;
  }

  .row {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .row dd {
    width: 100%;
    text-align: left;
  }

  .row-action {
    align-items: stretch;
    justify-content: space-between;
  }

  .ann-grid {
    grid-template-columns: 1fr;
  }

  .ann-dialog-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .ann-dialog-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}

@media (max-width: 480px) {
  .card-head {
    flex-direction: column;
  }

  .row-action {
    flex-direction: column;
  }

  .row-action .el-button,
  .ann-dialog-actions .el-button {
    width: 100%;
    margin-left: 0;
  }
}
</style>

