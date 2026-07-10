<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getToken, api } from '@/utils/api';
import { t } from '@/i18n';

const props = defineProps({
  preview: { type: Object, default: null },
});

const emit = defineEmits(['close']);

const route = useRoute();
const visible = ref(false);
const config = ref(null);

const DISMISS_KEY = 'vpn_announcement_dismissed';

const active = computed(() => props.preview || config.value);

const panelStyle = computed(() => {
  const c = active.value;
  if (!c) return {};
  const offset = `${c.offset ?? 24}px`;
  const width = `${c.width ?? 340}px`;
  const base = { width, maxWidth: 'calc(100vw - 48px)' };
  switch (c.position) {
    case 'top-left':
      return { ...base, top: offset, left: offset };
    case 'bottom-right':
      return { ...base, bottom: offset, right: offset };
    case 'bottom-left':
      return { ...base, bottom: offset, left: offset };
    default:
      return { ...base, top: offset, right: offset };
  }
});

function dismissKey(data) {
  const sig = [data.title, data.content, data.position, data.width].join('|');
  return `${DISMISS_KEY}:${sig}`;
}

function agree() {
  visible.value = false;
  if (props.preview) {
    emit('close');
    return;
  }
  if (config.value) {
    sessionStorage.setItem(dismissKey(config.value), '1');
  }
}

async function load() {
  if (props.preview) {
    visible.value = true;
    return;
  }
  if (!getToken() || route.meta.public) return;
  try {
    const data = await api('/api/account/announcement');
    if (!data?.enabled) return;
    if (sessionStorage.getItem(dismissKey(data))) return;
    config.value = data;
    visible.value = true;
  } catch {
    /* ignore */
  }
}

watch(
  () => [route.path, props.preview],
  () => {
    if (props.preview) {
      visible.value = true;
    }
  },
);

onMounted(load);
</script>

<template>
  <Teleport to="body">
    <transition name="ann-fade">
      <div v-if="visible && active" class="announcement-layer">
        <aside
          class="announcement-notice"
          :class="[`icon-${active.icon || 'none'}`]"
          :style="panelStyle"
          role="alertdialog"
          aria-modal="true"
          :aria-label="active.title || t('settings.announcementTitle')"
        >
          <header v-if="active.title" class="ann-title">{{ active.title }}</header>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="ann-body" v-html="active.content" />
          <footer class="ann-footer">
            <button type="button" class="ann-agree" @click="agree">
              {{ t('settings.announcementAgree') }}
            </button>
          </footer>
        </aside>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.announcement-layer {
  position: fixed;
  inset: 0;
  z-index: 4000;
  pointer-events: none;
}

.announcement-notice {
  position: fixed;
  z-index: 4001;
  pointer-events: auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
  border: 1px solid #ebeef5;
  padding: 16px 18px 14px;
  color: #303133;
}

.ann-close {
  display: none;
}

.ann-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 8px;
  padding-left: 0;
}

.announcement-notice.icon-info .ann-title {
  padding-left: 22px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23409eff'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'/%3E%3C/svg%3E")
    left center / 18px no-repeat;
}

.announcement-notice.icon-warning .ann-title {
  padding-left: 22px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23e6a23c'%3E%3Cpath d='M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z'/%3E%3C/svg%3E")
    left center / 18px no-repeat;
}

.announcement-notice.icon-success .ann-title {
  padding-left: 22px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2367c23a'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z'/%3E%3C/svg%3E")
    left center / 18px no-repeat;
}

.ann-body {
  font-size: 13px;
  line-height: 1.65;
  color: #606266;
  word-break: break-word;
}

.ann-body :deep(br) {
  display: block;
  content: '';
  margin-top: 0.35em;
}

.ann-footer {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}

.ann-agree {
  border: none;
  border-radius: 8px;
  background: #409eff;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  padding: 8px 20px;
  cursor: pointer;
}

.ann-agree:hover {
  background: #337ecc;
}

.ann-fade-enter-active,
.ann-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.ann-fade-enter-from,
.ann-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

