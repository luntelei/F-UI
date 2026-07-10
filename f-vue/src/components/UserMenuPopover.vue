<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { locale, t } from '@/i18n';
import { api, clearToken } from '@/utils/api';

const router = useRouter();
const user = ref(null);
const open = ref(false);
const panelStyle = ref({});
let closeTimer = null;

const initial = computed(() => {
  const email = user.value?.email || '';
  return (email.charAt(0) || 'U').toUpperCase();
});

const displayName = computed(() => {
  const email = user.value?.email || '';
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email || '-';
});

const roleLabel = computed(() => {
  void locale.value;
  return user.value?.role === 'admin' ? t('layout.roleAdmin') : t('layout.roleUser');
});

function floatingStyle(width, gap = 8) {
  if (typeof window === 'undefined') return {};
  const trigger = document.querySelector('.user-menu');
  if (!trigger) return {};
  const rect = trigger.getBoundingClientRect();
  const margin = 10;
  const safeWidth = Math.min(width, window.innerWidth - margin * 2);
  const dir = document.documentElement.dir;
  const preferredLeft = dir === 'rtl' ? rect.left : rect.right - safeWidth;
  const left = Math.min(Math.max(preferredLeft, margin), window.innerWidth - safeWidth - margin);
  return {
    left: `${left}px`,
    top: `${rect.bottom + gap}px`,
    width: `${safeWidth}px`,
  };
}

function showPanel() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  panelStyle.value = floatingStyle(280);
  open.value = true;
}

function hidePanel() {
  closeTimer = setTimeout(() => {
    open.value = false;
  }, 120);
}

function goDashboard() {
  open.value = false;
  router.push('/dashboard');
}

async function logout() {
  open.value = false;
  try {
    await api('/api/account/session/logout', { method: 'POST', body: '{}' });
  } catch {
    /* ignore */
  }
  clearToken();
  router.replace('/login');
}

onMounted(async () => {
  try {
    user.value = await api('/api/account/profile');
  } catch {
    user.value = null;
  }
});
</script>

<template>
  <div
    class="user-menu"
    @mouseenter="showPanel"
    @mouseleave="hidePanel"
  >
    <button type="button" class="user-trigger" :aria-expanded="open">
      <span class="avatar">{{ initial }}</span>
      <svg class="caret" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
        <path d="M7 10l5 5 5-5H7z" />
      </svg>
    </button>

    <transition name="user-pop">
      <div v-if="open && user" class="user-panel" :style="panelStyle">
        <div class="user-head">
          <span class="avatar avatar-lg">{{ initial }}</span>
          <div class="user-meta">
            <div class="user-name">{{ displayName }}</div>
            <div class="user-email">{{ user.email }}</div>
            <span class="role-tag">{{ roleLabel }}</span>
          </div>
        </div>

        <div class="user-actions">
          <button type="button" class="action-btn" @click="goDashboard">
            {{ t('layout.backToUser') }}
          </button>
          <button type="button" class="action-btn action-primary" @click="logout">
            {{ t('layout.logoutShort') }}
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
  direction: ltr;
}

.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 8px 0 4px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  color: #606266;
}

.user-trigger:hover,
.user-menu:hover .user-trigger {
  border-color: #c6e2ff;
  background: #f5f9ff;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(135deg, #409eff, #337ecc);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-lg {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  font-size: 18px;
}

.caret {
  opacity: 0.65;
}

.user-panel {
  position: fixed;
  width: 280px;
  max-width: calc(100vw - 20px);
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  padding: 16px;
  z-index: 2000;
}

.user-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding-bottom: 14px;
  border-bottom: 1px solid #f0f2f5;
  margin-bottom: 14px;
}

.user-meta {
  min-width: 0;
  flex: 1;
}

.user-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  line-height: 1.3;
}

.user-email {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  word-break: break-all;
}

.role-tag {
  display: inline-block;
  margin-top: 8px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #ecf5ff;
  color: #409eff;
  font-size: 12px;
  line-height: 1.5;
}

.user-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-btn {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  color: #606266;
  font-size: 14px;
  padding: 9px 12px;
  cursor: pointer;
}

.action-btn:hover {
  color: #409eff;
  border-color: #c6e2ff;
  background: #f5f9ff;
}

.action-primary {
  border-color: #409eff;
  background: #409eff;
  color: #fff;
}

.action-primary:hover {
  background: #337ecc;
  border-color: #337ecc;
  color: #fff;
}

.user-pop-enter-active,
.user-pop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.user-pop-enter-from,
.user-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

:global(html[dir='rtl'] .user-panel ){
  direction: rtl;
  text-align: right;
}

:global(html[dir='rtl'] .user-head ){
  flex-direction: row-reverse;
}

:global(html[dir='rtl'] .user-trigger ){
  padding: 0 4px 0 8px;
}

:global(html[dir='rtl'] .user-actions),
:global(html[dir='rtl'] .user-email ){
  direction: ltr;
  text-align: left;
}

@media (max-width: 420px) {
  .user-panel {
    position: fixed;
    top: 58px;
    right: 10px;
    left: 10px;
    width: auto;
  }

  :global(html[dir='rtl'] .user-panel ){
    right: 10px;
    left: 10px;
  }
}
</style>

