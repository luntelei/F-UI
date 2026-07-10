<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
onMounted(() => {
  router.replace('/manage/cf-usage');
});
</script>

<template>
  <div />
</template>
