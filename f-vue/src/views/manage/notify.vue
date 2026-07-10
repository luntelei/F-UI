<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { t } from '@/i18n';
import { api, apiDelete, apiPost, apiPut } from '@/utils/api';

const router = useRouter();
const loading = ref(false);
const sending = ref(false);
const config = ref(null);
const botForm = ref({ botToken: '' });
const chatForm = ref({ chatId: '' });

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

async function saveBot() {
  if (!botForm.value.botToken) return ElMessage.warning(t('settings.tgTokenRequired'));
  try {
    await apiPut('/api/super-admin/integrations/telegram/bot-token', { botToken: botForm.value.botToken });
    botForm.value.botToken = '';
    ElMessage.success(t('notify.botSaved'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.saveFailed'));
  }
}

async function saveChat() {
  if (!chatForm.value.chatId) return ElMessage.warning(t('settings.tgChatRequired'));
  try {
    await apiPut('/api/super-admin/integrations/telegram/chat', { chatId: chatForm.value.chatId });
    chatForm.value.chatId = '';
    ElMessage.success(t('notify.chatSaved'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.saveFailed'));
  }
}

async function clearBot() {
  try {
    await apiDelete('/api/super-admin/integrations/telegram/bot-token');
    ElMessage.success(t('notify.botCleared'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.clearFailed'));
  }
}

async function clearChat() {
  try {
    await apiDelete('/api/super-admin/integrations/telegram/chat');
    ElMessage.success(t('notify.chatCleared'));
    await load();
  } catch (e) {
    ElMessage.error(e.message || t('common.clearFailed'));
  }
}

async function sendTest() {
  sending.value = true;
  try {
    await apiPost('/api/super-admin/integrations/telegram/test', {});
    ElMessage.success(t('settings.tgTestOk'));
  } catch (e) {
    ElMessage.error(e.message || t('common.sendFailed'));
  } finally {
    sending.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <el-card v-loading="loading" style="margin-bottom: 16px">
      <template #header>{{ t('notify.statusTitle') }}</template>
      <el-descriptions v-if="config" :column="1" border>
        <el-descriptions-item :label="t('settings.tgBotToken')">
          {{ config.notify.telegramBotConfigured ? t('common.configured') : t('common.notConfigured') }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('settings.tgChatId')">
          {{ config.notify.telegramChatConfigured ? t('common.configured') : t('common.notConfigured') }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card style="margin-bottom: 16px">
      <template #header>{{ t('settings.tgBotToken') }}</template>
      <el-form label-position="top">
        <el-input v-model="botForm.botToken" type="password" show-password :placeholder="t('common.saveNoEcho')" />
        <div style="margin-top: 12px">
          <el-button type="primary" @click="saveBot">{{ t('common.save') }}</el-button>
          <el-button @click="clearBot">{{ t('settings.clear') }}</el-button>
        </div>
      </el-form>
    </el-card>

    <el-card style="margin-bottom: 16px">
      <template #header>{{ t('settings.tgChatId') }}</template>
      <el-form label-position="top">
        <el-input v-model="chatForm.chatId" :placeholder="t('notify.chatIdPlaceholder')" />
        <div style="margin-top: 12px">
          <el-button type="primary" @click="saveChat">{{ t('common.save') }}</el-button>
          <el-button @click="clearChat">{{ t('settings.clear') }}</el-button>
        </div>
      </el-form>
    </el-card>

    <el-card>
      <template #header>{{ t('notify.testTitle') }}</template>
      <el-button type="primary" :loading="sending" @click="sendTest">{{ t('notify.sendTest') }}</el-button>
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
@media (max-width: 640px) {
  .page {
    max-width: none;
  }

  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}
</style>

