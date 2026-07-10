<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { t } from '@/i18n';
import { api, apiPatch } from '@/utils/api';

const router = useRouter();
const loading = ref(false);
const users = ref([]);

async function load() {
  loading.value = true;
  try {
    users.value = await api('/api/super-admin/users');
  } catch (e) {
    ElMessage.error(e.message || t('common.permissionDenied'));
    router.replace('/dashboard');
  } finally {
    loading.value = false;
  }
}

async function toggleStatus(row) {
  const next = row.status === 'active' ? 'disabled' : 'active';
  try {
    const updated = await apiPatch(`/api/super-admin/users/${row.id}`, { status: next });
    Object.assign(row, updated);
    ElMessage.success(t('common.updated'));
  } catch (e) {
    ElMessage.error(e.message || t('common.updateFailed'));
  }
}

async function setRole(row, role) {
  try {
    const updated = await apiPatch(`/api/super-admin/users/${row.id}`, { role });
    Object.assign(row, updated);
    ElMessage.success(t('common.updated'));
  } catch (e) {
    ElMessage.error(e.message || t('common.updateFailed'));
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <el-card v-loading="loading">
      <el-table :data="users">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="email" :label="t('users.email')" />
        <el-table-column prop="role" :label="t('users.role')" width="100" />
        <el-table-column :label="t('users.status')" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? t('common.enabled') : t('common.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" :label="t('users.createdAt')" width="170" />
        <el-table-column :label="t('users.actions')" width="220">
          <template #default="{ row }">
            <el-button link type="primary" @click="toggleStatus(row)">
              {{ row.status === 'active' ? t('common.disabled') : t('common.enabled') }}
            </el-button>
            <el-button v-if="row.role === 'user'" link @click="setRole(row, 'admin')">{{ t('users.setAdmin') }}</el-button>
            <el-button v-else link @click="setRole(row, 'user')">{{ t('users.setUser') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  max-width: 1000px;
  width: 100%;
}
.title {
  margin: 0 0 16px;
  font-size: 20px;
}
@media (max-width: 640px) {
  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}
</style>

