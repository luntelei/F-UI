<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';
import UserMenuPopover from '@/components/UserMenuPopover.vue';
import { locale, t } from '@/i18n';
import { api } from '@/utils/api';

const route = useRoute();
const router = useRouter();
const config = ref(null);
const navOpen = ref(false);

const active = computed(() => route.path);
const isSuperAdmin = computed(() => config.value?.isSuperAdmin === true);

const items = computed(() => {
  const base = [
    { path: '/manage/free-quota', titleKey: 'nav.home', icon: 'home' },
    { path: '/manage/best', titleKey: 'nav.subNodes', icon: 'sub-nodes' },
  ];

  if (isSuperAdmin.value) {
    base.push(
      { path: '/manage/nodes', titleKey: 'nav.nodes', icon: 'node' },
      {
        path: '/manage/users',
        titleKey: 'nav.users',
        icon: 'users',
        children: [{ path: '/manage/reg-keys', titleKey: 'nav.regKeys', icon: 'key' }],
      },
      { path: '/manage/logs', titleKey: 'nav.logs', icon: 'logs' },
    );
  }

  base.push({ path: '/manage/settings', titleKey: 'nav.settings', icon: 'settings' });
  return base;
});

function isActive(path) {
  return active.value === path || active.value.startsWith(`${path}/`);
}

function isParentActive(item) {
  if (isActive(item.path)) return true;
  return item.children?.some((c) => isActive(c.path)) ?? false;
}

function closeMobileNav() {
  navOpen.value = false;
}

async function loadConfig() {
  try {
    config.value = await api('/api/admin/settings');
  } catch {
    config.value = null;
  }
}

const pageTitle = computed(() => {
  void locale.value;
  const hit = route.matched.find((r) => r.meta?.titleKey);
  return hit?.meta?.titleKey ? t(hit.meta.titleKey) : t('layout.console');
});

onMounted(loadConfig);

watch(
  () => route.fullPath,
  () => {
    void loadConfig();
  },
);
</script>

<template>
  <div class="console" :class="{ 'nav-open': navOpen }">
    <aside class="console-aside" :class="{ open: navOpen }">
      <div class="brand" @click="router.push('/manage/free-quota')">
        <span class="brand-main">
          <span class="brand-mark">V</span>
          <span class="brand-text">{{ t('layout.console') }}</span>
        </span>
        <button type="button" class="drawer-close" :aria-label="t('common.close')" @click.stop="closeMobileNav">
          <span />
          <span />
        </button>
      </div>

      <nav class="nav">
        <template v-for="item in items" :key="item.path">
          <router-link
            :to="item.path"
            class="nav-item"
            :class="{ active: isParentActive(item) && !(item.children?.some((c) => isActive(c.path))) }"
            @click="closeMobileNav"
          >
            <span class="nav-icon" :data-icon="item.icon" aria-hidden="true" />
            <span class="nav-label">{{ t(item.titleKey) }}</span>
          </router-link>
          <router-link
            v-for="child in item.children || []"
            :key="child.path"
            :to="child.path"
            class="nav-item nav-sub-item"
            :class="{ active: isActive(child.path) }"
            @click="closeMobileNav"
          >
            <span class="nav-icon" :data-icon="child.icon" aria-hidden="true" />
            <span class="nav-label">{{ t(child.titleKey) }}</span>
          </router-link>
        </template>
      </nav>
    </aside>
    <button
      v-if="navOpen"
      type="button"
      class="nav-scrim"
      :aria-label="t('common.close')"
      @click="closeMobileNav"
    />

    <div class="console-body">
      <header class="console-header">
        <div class="header-left">
          <button type="button" class="menu-btn" :aria-expanded="navOpen" @click="navOpen = !navOpen">
            <span />
            <span />
            <span />
          </button>
          <h1 class="header-title">{{ pageTitle }}</h1>
        </div>
        <div class="header-actions">
          <LanguageSwitcher />
          <UserMenuPopover />
        </div>
      </header>

      <main class="console-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.console {
  display: flex;
  width: 100%;
  min-height: 100vh;
  background: #f3f4f6;
  color: #303133;
  overflow-x: hidden;
}

.console-aside {
  width: 220px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e8eaed;
  display: flex;
  flex-direction: column;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 20px 18px 16px;
  cursor: pointer;
  user-select: none;
}

.brand-main {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #409eff, #337ecc);
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.brand-text {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.drawer-close {
  display: none;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #606266;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
}

.drawer-close span {
  position: absolute;
  left: 9px;
  right: 9px;
  top: 17px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
}

.drawer-close span:first-child {
  transform: rotate(45deg);
}

.drawer-close span:last-child {
  transform: rotate(-45deg);
}

.nav {
  flex: 1;
  padding: 4px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  color: #606266;
  text-decoration: none;
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
}

.nav-item:hover {
  background: #f5f7fa;
  color: #303133;
}

.nav-item.active {
  background: #eef0f3;
  color: #303133;
  font-weight: 500;
}

.nav-sub-item {
  padding-left: 40px;
  font-size: 13px;
}

.nav-sub-item .nav-icon {
  width: 16px;
  height: 16px;
}

.nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.75;
  background: currentColor;
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}

.nav-item.active .nav-icon {
  opacity: 1;
}

.nav-icon[data-icon='home'] {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5zm9-10H5.64l6.36-6.36L18.36 10z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5zm9-10H5.64l6.36-6.36L18.36 10z'/%3E%3C/svg%3E");
}

.nav-icon[data-icon='key'] {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 14c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm12.71-1.37-1.34-1.34c.39-.39.39-1.02 0-1.41l-2.12-2.12a.996.996 0 0 0-1.41 0l-1.34 1.34-5.15-5.15 1.34-1.34a.996.996 0 0 0 0-1.41L7.05 0.29a.996.996 0 0 0-1.41 0L3.52 2.41a.995.995 0 0 0 0 1.41l1.34 1.34L0 10.01l6 6 4.99-4.99 1.34 1.34c.39.39 1.02.39 1.41 0l2.12-2.12c.39-.39.39-1.02 0-1.41l-1.34-1.34 5.15-5.15 1.34 1.34c.39.39 1.02.39 1.41 0l2.12-2.12c.39-.39.39-1.02 0-1.41z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 14c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm12.71-1.37-1.34-1.34c.39-.39.39-1.02 0-1.41l-2.12-2.12a.996.996 0 0 0-1.41 0l-1.34 1.34-5.15-5.15 1.34-1.34a.996.996 0 0 0 0-1.41L7.05 0.29a.996.996 0 0 0-1.41 0L3.52 2.41a.995.995 0 0 0 0 1.41l1.34 1.34L0 10.01l6 6 4.99-4.99 1.34 1.34c.39.39 1.02.39 1.41 0l2.12-2.12c.39-.39.39-1.02 0-1.41l-1.34-1.34 5.15-5.15 1.34 1.34c.39.39 1.02.39 1.41 0l2.12-2.12c.39-.39.39-1.02 0-1.41z'/%3E%3C/svg%3E");
}

.nav-icon[data-icon='node'] {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 6h16v4H4V6zm0 8h16v4H4v-4zm2-6v2h2V8H6zm0 8v2h2v-2H6z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 6h16v4H4V6zm0 8h16v4H4v-4zm2-6v2h2V8H6zm0 8v2h2v-2H6z'/%3E%3C/svg%3E");
}

.nav-icon[data-icon='users'] {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z'/%3E%3C/svg%3E");
}

.nav-icon[data-icon='logs'] {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'/%3E%3C/svg%3E");
}

.nav-icon[data-icon='settings'] {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96a7.02 7.02 0 0 0-1.63-.94l-.36-2.54A.484.484 0 0 0 14.06 2h-3.12c-.24 0-.45.17-.49.41l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.25.41.49.41h3.12c.24 0 .45-.17.49-.41l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96a7.02 7.02 0 0 0-1.63-.94l-.36-2.54A.484.484 0 0 0 14.06 2h-3.12c-.24 0-.45.17-.49.41l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.25.41.49.41h3.12c.24 0 .45-.17.49-.41l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z'/%3E%3C/svg%3E");
}

.nav-icon[data-icon='chart'] {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 13h2v8H3v-8zm4-6h2v14H7V7zm4-4h2v18h-2V3zm4 8h2v10h-2V11zm4-6h2v16h-2V5z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 13h2v8H3v-8zm4-6h2v14H7V7zm4-4h2v18h-2V3zm4 8h2v10h-2V11zm4-6h2v16h-2V5z'/%3E%3C/svg%3E");
}

.nav-icon[data-icon='quota'] {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.39 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.39 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z'/%3E%3C/svg%3E");
}

.nav-icon[data-icon='bell'] {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z'/%3E%3C/svg%3E");
}

.nav-icon[data-icon='convert'] {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z'/%3E%3C/svg%3E");
}

.nav-icon[data-icon='sub-nodes'] {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 6h2v2H3V6zm0 5h2v2H3v-2zm0 5h2v2H3v-2zM9 7h12v1.5H9V7zm0 5h12v1.5H9V12zm0 5h8v1.5H9V17z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 6h2v2H3V6zm0 5h2v2H3v-2zm0 5h2v2H3v-2zM9 7h12v1.5H9V7zm0 5h12v1.5H9V12zm0 5h8v1.5H9V17z'/%3E%3C/svg%3E");
}

.aside-footer {
  padding: 16px 18px 20px;
  border-top: 1px solid #f0f2f5;
}

.back-link {
  border: none;
  background: none;
  color: #409eff;
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}

.back-link:hover {
  text-decoration: underline;
}

.console-body {
  flex: 1;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.console-header {
  height: 56px;
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1px solid #e8eaed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  direction: ltr;
}

.icon-btn {
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

.icon-btn:hover {
  background: #f5f7fa;
  color: #303133;
}

.console-main {
  flex: 1;
  padding: 20px 24px 32px;
  overflow: auto;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

:global(html[dir='rtl'] .console ){
  direction: rtl;
}

:global(html[dir='rtl'] .console-aside ){
  border-right: none;
  border-left: 1px solid #e8eaed;
}

:global(html[dir='rtl'] .brand),
:global(html[dir='rtl'] .nav-item),
:global(html[dir='rtl'] .header-left ){
  direction: rtl;
}

:global(html[dir='rtl'] .brand ){
  justify-content: flex-start;
}

:global(html[dir='rtl'] .nav-item ){
  justify-content: flex-start;
  text-align: right;
}

:global(html[dir='rtl'] .nav-sub-item ){
  padding-left: 12px;
  padding-right: 40px;
}

:global(html[dir='rtl'] .console-main ){
  direction: rtl;
}

.menu-btn {
  display: none;
  width: 36px;
  height: 36px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
  color: #606266;
  padding: 8px;
  cursor: pointer;
  flex-shrink: 0;
}

.menu-btn span {
  display: block;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
}

.menu-btn span + span {
  margin-top: 5px;
}

.nav-scrim {
  display: none;
}

@media (max-width: 900px) {
  :global(html[dir='rtl'] .console ){
    direction: ltr;
  }

  .console {
    flex-direction: column;
  }

  .console-aside {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #e8eaed;
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .brand {
    display: none;
  }

  .nav {
    flex-direction: row;
    gap: 6px;
    padding: 8px 12px;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .nav-item {
    flex: 0 0 auto;
    padding: 9px 11px;
    white-space: nowrap;
  }

  .nav-sub-item {
    padding-left: 11px;
  }

  :global(html[dir='rtl'] .console-aside ){
    border-left: none;
    border-bottom: 1px solid #e8eaed;
  }

  :global(html[dir='rtl'] .nav-sub-item ){
    padding-right: 11px;
  }

  .console-header {
    height: auto;
    min-height: 56px;
    width: 100%;
    padding: 10px 14px;
    gap: 12px;
    position: sticky;
    top: 50px;
    z-index: 40;
  }

  :global(html[dir='rtl'] .console-header),
  :global(html[dir='rtl'] .console-main ){
    direction: rtl;
  }

  .header-title {
    font-size: 16px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .console-main {
    padding: 14px 14px 24px;
    overflow: visible;
  }
}

@media (max-width: 640px) {
  .console,
  .console-body,
  .console-main {
    width: 100%;
    max-width: 100vw;
  }

  .console-aside {
    position: fixed;
    inset: 0 0 0 auto;
    width: min(82vw, 320px);
    height: 100dvh;
    display: flex;
    border-right: none;
    border-left: 1px solid #e8eaed;
    border-bottom: none;
    box-shadow: -12px 0 32px rgba(15, 23, 42, 0.18);
    transform: translateX(100%);
    transition: transform 0.22s ease;
    z-index: 1000;
  }

  :global(html[dir='rtl'] .console-aside ){
    inset: 0 0 0 auto;
    border-left: 1px solid #e8eaed;
    border-right: none;
    box-shadow: -12px 0 32px rgba(15, 23, 42, 0.18);
    transform: translateX(100%);
  }

  .console-aside.open {
    transform: translateX(0);
  }

  .brand {
    display: flex;
    justify-content: space-between;
    padding: 16px 14px;
    border-bottom: 1px solid #f0f2f5;
  }

  .drawer-close {
    display: inline-flex;
  }

  .nav {
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .nav-item {
    width: 100%;
    flex: 0 0 auto;
    justify-content: flex-start;
    padding: 12px;
    border-radius: 8px;
    white-space: normal;
  }

  .nav-sub-item {
    padding-left: 34px;
  }

  :global(html[dir='rtl'] .nav-sub-item ){
    padding-left: 12px;
    padding-right: 34px;
  }

  .nav-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 999;
    border: none;
    background: rgba(15, 23, 42, 0.42);
    cursor: pointer;
  }

  .menu-btn {
    display: inline-block;
  }

  .console-header {
    top: 0;
  }

  :global(html[dir='rtl'] .console-header ){
    direction: ltr;
  }

  :global(html[dir='rtl'] .header-left ){
    direction: rtl;
    min-width: 0;
  }

  .header-actions {
    gap: 6px;
    flex-shrink: 0;
  }

  .console-main {
    padding: 12px 10px 24px;
  }
}
</style>

