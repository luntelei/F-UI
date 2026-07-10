import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from '@/utils/api';

const manageChildren = [
  { path: 'free-quota', name: 'manage-free-quota', component: () => import('@/views/manage/free-quota.vue'), meta: { titleKey: 'nav.home' } },
  { path: 'reg-keys', name: 'manage-reg-keys', component: () => import('@/views/manage/reg-keys.vue'), meta: { titleKey: 'nav.regKeys', superAdmin: true } },
  { path: 'nodes', name: 'manage-nodes', component: () => import('@/views/manage/nodes.vue'), meta: { titleKey: 'nav.nodes', superAdmin: true } },
  { path: 'best', name: 'manage-best', component: () => import('@/views/manage/best.vue'), meta: { titleKey: 'nav.subNodes' } },
  { path: 'users', name: 'manage-users', component: () => import('@/views/manage/users.vue'), meta: { titleKey: 'nav.users', superAdmin: true } },
  { path: 'logs', name: 'manage-logs', component: () => import('@/views/manage/logs.vue'), meta: { titleKey: 'nav.logs', superAdmin: true } },
  { path: 'settings', name: 'manage-settings', component: () => import('@/views/manage/settings.vue'), meta: { titleKey: 'nav.settings' } },
  { path: 'cf-usage', redirect: { name: 'manage-settings' } },
  { path: 'notify', redirect: { name: 'manage-settings' } },
  { path: 'security', redirect: { name: 'manage-settings' } },
];

const routes = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/index.vue'),
    meta: { public: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/register/index.vue'),
    meta: { public: true },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/dashboard/index.vue'),
  },
  {
    path: '/manage',
    component: () => import('@/layouts/ManageLayout.vue'),
    meta: { admin: true },
    redirect: '/manage/free-quota',
    children: manageChildren,
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to) => {
  const token = getToken();
  if (to.meta.public) {
    if (token && (to.name === 'login' || to.name === 'register')) {
      return '/dashboard';
    }
    return true;
  }
  if (!token) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.matched.some((r) => r.meta.admin)) {
    try {
      const res = await fetch('/api/account/profile', {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (json?.data?.role !== 'admin') {
        return '/dashboard';
      }
      if (to.matched.some((r) => r.meta.superAdmin)) {
        const cfgRes = await fetch('/api/admin/settings', {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        const cfgJson = await cfgRes.json();
        if (cfgJson?.data?.isSuperAdmin !== true) {
          return '/manage/free-quota';
        }
      }
    } catch {
      return '/dashboard';
    }
  }
  return true;
});

export default router;

