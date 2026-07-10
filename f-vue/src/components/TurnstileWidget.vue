<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { t } from '@/i18n';

const props = defineProps({
  siteKey: {
    type: String,
    default: '',
  },
  enabled: {
    type: Boolean,
    default: false,
  },
});

const token = defineModel('token', { type: String, default: '' });

const emit = defineEmits(['ready', 'error']);

const turnstileEl = ref(null);
const ready = ref(false);
const failed = ref(false);
let widgetId = null;
let scriptPromise = null;
const LOAD_TIMEOUT_MS = 10000;

function clearWidget() {
  if (widgetId != null && window.turnstile?.remove) {
    window.turnstile.remove(widgetId);
  }
  widgetId = null;
  ready.value = false;
  token.value = '';
}

function loadTurnstileScript() {
  if (window.turnstile?.render) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new Error('Turnstile load timeout')));
    }, LOAD_TIMEOUT_MS);
    const existing = document.querySelector('script[data-turnstile]');
    if (existing) {
      existing.addEventListener('load', () => finish(resolve), { once: true });
      existing.addEventListener('error', () => finish(reject), { once: true });
      if (window.turnstile?.render) finish(resolve);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = '1';
    script.onload = () => finish(resolve);
    script.onerror = () => finish(reject);
    document.head.appendChild(script);
  }).then(() => {
    if (!window.turnstile?.render) {
      throw new Error('Turnstile unavailable');
    }
  }).catch((e) => {
    scriptPromise = null;
    throw e;
  });

  return scriptPromise;
}

async function renderTurnstile() {
  clearWidget();
  failed.value = false;
  if (!props.enabled || !props.siteKey) return;

  await nextTick();
  if (!turnstileEl.value) return;

  try {
    await loadTurnstileScript();
    widgetId = window.turnstile.render(turnstileEl.value, {
      sitekey: props.siteKey,
      callback: (value) => {
        token.value = value;
        ready.value = true;
        emit('ready');
      },
      'expired-callback': () => {
        token.value = '';
        ready.value = false;
      },
      'error-callback': () => {
        token.value = '';
        ready.value = false;
        failed.value = true;
        emit('error');
        ElMessage.error(t('login.turnstileError'));
      },
    });
  } catch {
    failed.value = true;
    emit('error');
    ElMessage.error(t('login.turnstileLoadError'));
  }
}

watch(
  () => [props.enabled, props.siteKey],
  () => {
    void renderTurnstile();
  },
  { immediate: true },
);

defineExpose({
  ready,
  failed,
  reset: renderTurnstile,
});

onBeforeUnmount(clearWidget);
</script>

<template>
  <div class="turnstile-box">
    <div ref="turnstileEl" class="turnstile-widget" />
  </div>
</template>

<style scoped>
.turnstile-box {
  min-height: 65px;
  max-width: 100%;
  overflow-x: auto;
}

.turnstile-widget {
  min-height: 65px;
}
</style>
