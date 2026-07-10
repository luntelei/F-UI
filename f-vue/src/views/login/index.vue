<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';
import TurnstileWidget from '@/components/TurnstileWidget.vue';
import { t } from '@/i18n';
import { api, setToken } from '@/utils/api';

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const initInfo = ref(null);
const form = ref({ email: '', password: '' });
const turnstileWidget = ref(null);
const turnstileToken = ref('');

const requireTurnstile = computed(
  () => Boolean(initInfo.value?.requireLoginTurnstile && initInfo.value?.turnstileSiteKey),
);
const turnstileBlocked = computed(
  () => Boolean(initInfo.value?.requireLoginTurnstile && !initInfo.value?.turnstileSiteKey),
);

onMounted(async () => {
  try {
    initInfo.value = await api('/api/auth/bootstrap');
  } catch {
    initInfo.value = { siteName: 'F-UI' };
  }
});

async function onSubmit() {
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
    const payload = { ...form.value };
    if (turnstileToken.value) {
      payload.turnstileToken = turnstileToken.value;
    }
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setToken(data.token);
    ElMessage.success(t('login.loginSuccess'));
    router.replace(route.query.redirect || '/dashboard');
  } catch (e) {
    ElMessage.error(e.message || t('login.loginFailed'));
    await turnstileWidget.value?.reset?.();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-top">
      <LanguageSwitcher />
    </div>
    <el-card class="auth-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>{{ initInfo?.siteName ?? 'F-UI' }}</span>
        </div>
      </template>

      <el-form label-position="top" @submit.prevent="onSubmit">
        <el-form-item :label="t('login.email')">
          <el-input v-model="form.email" type="email" autocomplete="username" />
        </el-form-item>
        <el-form-item :label="t('login.password')">
          <el-input v-model="form.password" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item v-if="requireTurnstile" :label="t('login.turnstile')">
          <TurnstileWidget
            ref="turnstileWidget"
            v-model:token="turnstileToken"
            :enabled="requireTurnstile"
            :site-key="initInfo.turnstileSiteKey"
          />
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">
          {{ t('login.submit') }}
        </el-button>
      </el-form>

      <div class="footer-links">
        <router-link v-if="initInfo?.allowBootstrap" to="/register">{{ t('login.bootstrapRegister') }}</router-link>
        <router-link v-else to="/register">{{ t('login.inviteRegister') }}</router-link>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.auth-top {
  width: 100%;
  max-width: 420px;
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.auth-card {
  width: 100%;
  max-width: 420px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}
.footer-links {
  margin-top: 16px;
  text-align: center;
  font-size: 14px;
}
@media (max-width: 480px) {
  .auth-page {
    justify-content: flex-start;
    padding: 16px 12px;
  }

  .auth-top {
    max-width: none;
  }

  .auth-card {
    max-width: none;
  }

  .card-header {
    gap: 10px;
    flex-wrap: wrap;
  }
}
</style>

