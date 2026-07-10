<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ElConfigProvider } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import en from 'element-plus/es/locale/lang/en';
import AnnouncementNotice from '@/components/AnnouncementNotice.vue';
import { locale } from '@/i18n';
import { getToken } from '@/utils/api';

const route = useRoute();

const epLocale = computed(() => {
  const map = {
    'zh-CN': zhCn,
    'zh-TW': zhCn,
    en,
    fa: en,
    vi: en,
    ru: en,
  };
  return map[locale.value] || zhCn;
});

const showAnnouncement = computed(() => {
  void route.fullPath;
  return Boolean(getToken()) && !route.meta.public;
});
</script>

<template>
  <el-config-provider :locale="epLocale">
    <router-view />
    <AnnouncementNotice v-if="showAnnouncement" />
  </el-config-provider>
</template>

