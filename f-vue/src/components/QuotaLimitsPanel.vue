<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import UsageGaugeCard from '@/components/UsageGaugeCard.vue';
import { t } from '@/i18n';
import { formatCountdown, getNextResetUtc } from '@/utils/usage-reset';

const props = defineProps({
  loading: { type: Boolean, default: false },
  usage: { type: Object, default: null },
  error: { type: String, default: '' },
});

const emit = defineEmits(['refresh']);

const router = useRouter();
const countdown = ref({ h: '00', m: '00', s: '00' });
let timer = null;

const hasData = computed(() => props.usage?.success === true);

const gauges = computed(() => {
  const u = props.usage;
  if (!u) return [];
  return [
    {
      id: 'workers',
      title: t('home.limitWorkersPages'),
      note: t('home.limitWorkersNote'),
      used: u.totalRequestsToday ?? 0,
      quota: u.dailyQuota ?? 100_000,
      kind: 'count',
    },
    {
      id: 'cpu',
      title: t('home.limitCpu'),
      note: t('home.limitCpuNote'),
      used: u.workersAvgCpuMs ?? 0,
      quota: u.workersCpuQuotaMs ?? 10,
      kind: 'cpu',
    },
    {
      id: 'd1Read',
      title: t('home.limitD1Read'),
      note: t('home.limitD1ReadNote'),
      used: u.d1ReadQueriesToday ?? 0,
      quota: u.d1ReadQuota ?? 50_000,
      kind: 'count',
    },
    {
      id: 'd1Write',
      title: t('home.limitD1Write'),
      note: t('home.limitD1WriteNote'),
      used: u.d1WriteQueriesToday ?? 0,
      quota: u.d1WriteQuota ?? 1_000,
      kind: 'count',
    },
    {
      id: 'kvRead',
      title: t('home.limitKvRead'),
      note: t('home.limitKvReadNote'),
      used: u.kvReadRequestsToday ?? 0,
      quota: u.kvReadQuota ?? 100_000,
      kind: 'count',
    },
    {
      id: 'kvWrite',
      title: t('home.limitKvWrite'),
      note: t('home.limitKvWriteNote'),
      used: u.kvWriteRequestsToday ?? 0,
      quota: u.kvWriteQuota ?? 1_000,
      kind: 'count',
    },
    {
      id: 'cron',
      title: t('home.limitCron'),
      note: t('home.limitCronNote'),
      used: u.cronTriggersConfigured ?? 0,
      quota: u.cronTriggersQuota ?? 1,
      kind: 'cron',
    },
  ];
});

function tickCountdown() {
  const diff = getNextResetUtc().getTime() - Date.now();
  countdown.value = formatCountdown(diff);
}

onMounted(() => {
  tickCountdown();
  timer = setInterval(tickCountdown, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <section class="cf-dashboard">
    <header class="dash-head">
      <h2 class="dash-title">{{ t('home.limitsTitle') }}</h2>
      <button
        type="button"
        class="refresh-btn"
        :disabled="loading"
        :title="t('home.refresh')"
        @click="emit('refresh')"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" :class="{ spin: loading }" aria-hidden="true">
          <path
            d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
          />
        </svg>
      </button>
    </header>

    <div class="reset-card">
      <div class="reset-main">
        <span class="reset-label">{{ t('home.resetCountdown') }}</span>
        <span class="reset-time">
          {{ countdown.h }}:{{ countdown.m }}:{{ countdown.s }}
        </span>
      </div>
      <p class="reset-schedule">{{ t('home.resetSchedule') }}</p>
      <p class="reset-hint">{{ t('home.limitsHint') }}</p>
      <p class="reset-hint">{{ t('home.resetScope') }}</p>
    </div>

    <div v-if="error && !loading" class="dash-error">
      <p>{{ error }}</p>
      <button type="button" class="link-btn" @click="router.push('/manage/settings')">
        {{ t('home.configureCf') }}
      </button>
    </div>

    <div v-else class="gauge-grid">
      <UsageGaugeCard
        v-for="item in gauges"
        :key="item.id"
        :title="item.title"
        :note="item.note"
        :used="item.used"
        :quota="item.quota"
        :kind="item.kind"
        :has-data="hasData"
        :loading="loading"
      />
    </div>
  </section>
</template>

<style scoped>
.cf-dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dash-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.refresh-btn {
  width: 36px;
  height: 36px;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  background: #fff;
  color: #909399;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, border-color 0.15s;
}

.refresh-btn:hover:not(:disabled) {
  color: #409eff;
  border-color: #c6e2ff;
}

.refresh-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.refresh-btn svg.spin {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.reset-card {
  background: linear-gradient(135deg, #f0f7ff 0%, #fdf8ef 100%);
  border: 1px solid #dce8f5;
  border-radius: 12px;
  padding: 18px 22px;
}

.reset-main {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-bottom: 8px;
}

.reset-label {
  font-size: 14px;
  font-weight: 600;
  color: #606266;
}

.reset-time {
  font-size: 28px;
  font-weight: 700;
  color: #409eff;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.reset-schedule {
  margin: 0 0 8px;
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
}

.reset-hint {
  margin: 0 0 6px;
  font-size: 12px;
  color: #909399;
  line-height: 1.65;
}

.reset-hint:last-child {
  margin-bottom: 0;
}

.dash-error {
  padding: 18px 20px;
  background: #fef0f0;
  border-radius: 12px;
  color: #f56c6c;
  font-size: 14px;
}

.dash-error p {
  margin: 0 0 10px;
}

.link-btn {
  border: none;
  background: none;
  color: #409eff;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  text-decoration: underline;
}

.gauge-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 1024px) {
  .gauge-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .gauge-grid {
    grid-template-columns: 1fr;
  }

  .reset-time {
    font-size: 24px;
  }

  .reset-card {
    padding: 16px 14px;
  }

  .dash-title {
    font-size: 18px;
  }
}
</style>
