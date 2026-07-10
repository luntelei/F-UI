<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { locale, setLocale, SUPPORTED_LOCALES } from '@/i18n';

const menuOpen = ref(false);
const root = ref(null);
const menuStyle = ref({});

const currentLabel = computed(
  () => SUPPORTED_LOCALES.find((l) => l.code === locale.value)?.label || '简体中文',
);

function floatingStyle(width, gap = 6) {
  if (typeof window === 'undefined' || !root.value) return {};
  const rect = root.value.getBoundingClientRect();
  const margin = 10;
  const safeWidth = Math.min(width, window.innerWidth - margin * 2);
  const dir = document.documentElement.dir;
  const preferredLeft = dir === 'rtl' ? rect.left : rect.right - safeWidth;
  const left = Math.min(Math.max(preferredLeft, margin), window.innerWidth - safeWidth - margin);
  return {
    left: `${left}px`,
    top: `${rect.bottom + gap}px`,
    minWidth: `${safeWidth}px`,
  };
}

function toggleMenu() {
  if (menuOpen.value) {
    menuOpen.value = false;
    return;
  }
  menuStyle.value = floatingStyle(176);
  menuOpen.value = true;
}

function pick(code) {
  setLocale(code);
  menuOpen.value = false;
}

function onDocClick(e) {
  if (!root.value?.contains(e.target)) menuOpen.value = false;
}

onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <div ref="root" class="lang-switch">
    <button type="button" class="lang-btn" :title="currentLabel" @click="toggleMenu">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path
          d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.93 9h-2.95a15.3 15.3 0 0 0-1.03-4.02A8.03 8.03 0 0 1 19.93 11zM12 4c.9 1.35 1.54 2.9 1.86 4.58H10.14C10.46 6.9 11.1 5.35 12 4zM8.05 6.98A15.3 15.3 0 0 0 7.02 11H4.07a8.03 8.03 0 0 1 3.98-4.02zM4.07 13h2.95c.22 1.41.6 2.76 1.03 4.02A8.03 8.03 0 0 1 4.07 13zm5.07 7.42c-.9-1.35-1.54-2.9-1.86-4.58h3.72c-.32 1.68-.96 3.23-1.86 4.58zm3.9 0a15.3 15.3 0 0 0 1.03-4.02h2.95a8.03 8.03 0 0 1-3.98 4.02zM16.98 17.02c.43-1.26.81-2.61 1.03-4.02h2.95a8.03 8.03 0 0 1-3.98 4.02z"
        />
      </svg>
    </button>
    <div v-if="menuOpen" class="lang-menu" :style="menuStyle">
      <button
        v-for="item in SUPPORTED_LOCALES"
        :key="item.code"
        type="button"
        class="lang-item"
        :class="{ active: locale === item.code }"
        @click="pick(item.code)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.lang-switch {
  position: relative;
  direction: ltr;
}

.lang-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #606266;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.lang-btn:hover {
  background: #f5f7fa;
  color: #303133;
}

.lang-menu {
  position: fixed;
  min-width: 148px;
  max-width: calc(100vw - 20px);
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  padding: 6px 0;
  z-index: 100;
}

.lang-item {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 10px 16px;
  font-size: 14px;
  color: #303133;
  cursor: pointer;
}

.lang-item:hover {
  background: #f5f7fa;
}

.lang-item.active {
  background: #eef0f3;
  font-weight: 500;
}

:global(html[dir='rtl'] .lang-menu ){
  direction: rtl;
}

:global(html[dir='rtl'] .lang-item ){
  text-align: right;
  direction: rtl;
}
</style>
