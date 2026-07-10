<script setup>
import { computed } from 'vue';
import { formatNumber, formatUsagePercent, GAUGE_ARC_LEN, usagePercent } from '@/utils/usage-reset';

const props = defineProps({
  title: { type: String, required: true },
  note: { type: String, default: '' },
  used: { type: Number, default: 0 },
  quota: { type: Number, default: 1 },
  kind: { type: String, default: 'count' },
  hasData: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
});

const percent = computed(() => usagePercent(props.used, props.quota));
const percentLabel = computed(() => formatUsagePercent(percent.value));

const valueText = computed(() => {
  if (!props.hasData) return '—';
  if (props.kind === 'cpu') {
    return `${Number(props.used).toFixed(2)} / ${props.quota} ms`;
  }
  if (props.kind === 'cron') {
    return `${props.used} / ${props.quota}`;
  }
  return `${formatNumber(props.used)} / ${formatNumber(props.quota)}`;
});

const arcColor = computed(() => {
  if (props.kind === 'cron') {
    return props.used <= props.quota ? '#67c23a' : '#f56c6c';
  }
  const p = percent.value;
  if (p >= 90) return '#f56c6c';
  if (p >= 70) return '#e6a23c';
  return '#409eff';
});

const dashOffset = computed(() => {
  if (props.loading || !props.hasData) return GAUGE_ARC_LEN;
  if (props.kind === 'cron') {
    // 未超出额度时显示完整刻度。
    return props.used <= props.quota ? 0 : GAUGE_ARC_LEN * 0.25;
  }
  return GAUGE_ARC_LEN * (1 - percent.value / 100);
});

const centerText = computed(() => {
  if (!props.hasData) return '—';
  if (props.kind === 'cron') return valueText.value;
  return percentLabel.value;
});
</script>

<template>
  <article class="gauge-card">
    <h3 class="gauge-title">{{ title }}</h3>
    <div class="gauge-body">
      <svg class="gauge-svg" viewBox="0 0 120 72" aria-hidden="true">
        <path
          class="gauge-track"
          d="M 12 60 A 48 48 0 0 1 108 60"
          fill="none"
          stroke-width="10"
          stroke-linecap="round"
        />
        <path
          class="gauge-fill"
          d="M 12 60 A 48 48 0 0 1 108 60"
          fill="none"
          stroke-width="10"
          stroke-linecap="round"
          :stroke="arcColor"
          :stroke-dasharray="`${GAUGE_ARC_LEN} ${GAUGE_ARC_LEN}`"
          :stroke-dashoffset="dashOffset"
        />
      </svg>
      <div class="gauge-center">
        <span class="gauge-percent" :class="{ 'gauge-cron': kind === 'cron' }">{{ centerText }}</span>
      </div>
    </div>
    <p v-if="kind !== 'cron'" class="gauge-value">{{ valueText }}</p>
    <p v-else-if="hasData" class="gauge-value">{{ note }}</p>
    <p v-if="kind !== 'cron' && note" class="gauge-note">{{ note }}</p>
  </article>
</template>

<style scoped>
.gauge-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 16px 14px 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 168px;
}

.gauge-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  text-align: center;
  width: 100%;
}

.gauge-body {
  position: relative;
  width: 120px;
  height: 72px;
  margin: 4px 0 2px;
}

.gauge-svg {
  width: 120px;
  height: 72px;
  display: block;
}

.gauge-track {
  stroke: #e8edf3;
}

.gauge-fill {
  transition: stroke-dashoffset 0.45s ease, stroke 0.2s ease;
}

.gauge-center {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 2px;
  text-align: center;
  pointer-events: none;
}

.gauge-percent {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  font-variant-numeric: tabular-nums;
}

.gauge-cron {
  font-size: 15px;
}

.gauge-value {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.gauge-note {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: #909399;
  text-align: center;
  width: 100%;
}
</style>
