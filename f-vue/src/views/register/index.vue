<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import TurnstileWidget from '@/components/TurnstileWidget.vue';
import { t } from '@/i18n';
import { api, setToken } from '@/utils/api';

const router = useRouter();
const loading = ref(false);
const initInfo = ref(null);
const form = ref({ email: '', password: '', regKey: '', termsAccepted: false });
const turnstileWidget = ref(null);
const turnstileToken = ref('');

const userAgreementText = computed(() => t('register.userAgreementContent'));

const requireTurnstile = computed(
  () => Boolean(initInfo.value?.requireTurnstile && initInfo.value?.turnstileSiteKey),
);
const turnstileBlocked = computed(
  () => Boolean(initInfo.value?.requireTurnstile && !initInfo.value?.turnstileSiteKey),
);

onMounted(async () => {
  initInfo.value = await api('/api/auth/bootstrap');
});

async function onSubmit() {
  if (!form.value.termsAccepted) {
    ElMessage.warning(t('register.termsRequired'));
    return;
  }
  if (turnstileBlocked.value) {
    ElMessage.error(t('人机验证未配置完成'));
    return;
  }
  if (requireTurnstile.value && !turnstileToken.value) {
    ElMessage.warning(t('login.turnstileRequired'));
    return;
  }
  loading.value = true;
  try {
    const payload = {
      email: form.value.email,
      password: form.value.password,
      termsAccepted: form.value.termsAccepted,
    };
    if (!initInfo.value?.allowBootstrap) {
      payload.regKey = form.value.regKey;
    }
    if (turnstileToken.value) {
      payload.turnstileToken = turnstileToken.value;
    }
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setToken(data.token);
    ElMessage.success(t('register.success'));
    router.replace('/dashboard');
  } catch (e) {
    ElMessage.error(e.message || t('register.failed'));
    await turnstileWidget.value?.reset?.();
  } finally {
    loading.value = false;
  }
}

async function showUserAgreement() {
  await ElMessageBox.alert(userAgreementText.value, t('register.userAgreementTitle'), {
    confirmButtonText: t('common.ok'),
    customClass: 'terms-dialog',
  });
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>{{ t('register.title') }}</span>
        </div>
      </template>

      <el-alert
        v-if="initInfo?.allowBootstrap"
        type="info"
        :closable="false"
        show-icon
        :title="t('register.bootstrapTitle')"
        :description="t('register.adminEmail', { email: initInfo.adminEmail })"
        style="margin-bottom: 16px"
      />

      <el-alert
        v-else-if="initInfo?.inviteOnly"
        type="warning"
        :closable="false"
        show-icon
        :title="t('register.inviteOnlyTitle')"
        :description="t('register.inviteOnlyDesc')"
        style="margin-bottom: 16px"
      />

      <el-form label-position="top" @submit.prevent="onSubmit">
        <el-form-item :label="t('login.email')">
          <el-input v-model="form.email" type="email" autocomplete="username" />
        </el-form-item>
        <el-form-item :label="t('login.password')">
          <el-input v-model="form.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item v-if="!initInfo?.allowBootstrap" :label="t('register.regKey')">
          <el-input v-model="form.regKey" :placeholder="t('register.regKeyPlaceholder')" />
        </el-form-item>
        <el-form-item v-if="requireTurnstile" :label="t('login.turnstile')">
          <TurnstileWidget
            ref="turnstileWidget"
            v-model:token="turnstileToken"
            :enabled="requireTurnstile"
            :site-key="initInfo.turnstileSiteKey"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="form.termsAccepted">
            {{ t('register.termsPrefix') }}
            <el-button link type="primary" class="terms-link" @click.prevent="showUserAgreement">
              {{ t('register.userAgreementTitle') }}
            </el-button>
          </el-checkbox>
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">
          {{ t('register.submit') }}
        </el-button>
      </el-form>

      <div class="footer-links">
        <router-link to="/login">{{ t('register.loginLink') }}</router-link>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.auth-card {
  width: 100%;
  max-width: 420px;
}
.card-header {
  font-weight: 600;
}
.footer-links {
  margin-top: 16px;
  text-align: center;
  font-size: 14px;
}

.terms-link {
  height: auto;
  padding: 0;
  vertical-align: baseline;
}

:global(.terms-dialog .el-message-box__message) {
  max-height: min(62vh, 520px);
  overflow: auto;
  white-space: pre-line;
  line-height: 1.7;
}
@media (max-width: 480px) {
  .auth-page {
    align-items: stretch;
    justify-content: flex-start;
    padding: 16px 12px;
  }

  .auth-card {
    max-width: none;
  }
}
</style>

