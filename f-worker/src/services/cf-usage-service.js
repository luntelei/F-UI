import { readSecret, SECRET_TYPES } from './secrets-service.js';

import { AppError } from '../utils/response.js';



export const FREE_TIER_QUOTAS = {

  workersRequests: 100_000,

  d1Reads: 50_000,

  d1Writes: 1_000,

  kvReads: 100_000,

  kvWrites: 1_000,

  workersCpuMsPerRequest: 10,

  cronTriggers: 1,

};



async function cfFetch(path, headers) {

  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers });

  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json.success) {

    const msg = json?.errors?.[0]?.message || `Cloudflare API HTTP ${res.status}`;

    throw new AppError(msg, 502);

  }

  return json.result;

}



/** Cloudflare daily counters reset at UTC midnight, which is 08:00 in Beijing. */

export function getTodayUsageWindow() {

  const until = new Date();

  const since = new Date(until);

  since.setUTCHours(0, 0, 0, 0);

  return { since: since.toISOString(), until: until.toISOString() };

}



export function getTodayUtcDateStr() {

  return new Date().toISOString().slice(0, 10);

}



function sumAdaptiveRequests(rows) {

  if (!Array.isArray(rows) || rows.length === 0) return 0;

  let total = 0;

  for (const row of rows) {

    const n = row?.sum?.requests;

    if (n != null && !Number.isNaN(Number(n))) {

      total += Number(n);

    }

  }

  return total;

}



function sumWorkersCpu(rows) {
  let requests = 0;
  let cpuTimeUs = 0;
  for (const row of rows || []) {
    requests += Number(row?.sum?.requests || 0);
    cpuTimeUs += Number(row?.sum?.cpuTimeUs || 0);
  }
  return {
    requests,
    cpuTimeUs,
    avgCpuMs: requests > 0 ? cpuTimeUs / requests / 1000 : 0,
  };
}



function sumD1Queries(groups) {

  let readQueries = 0;

  let writeQueries = 0;

  for (const row of groups || []) {

    readQueries += Number(row?.sum?.readQueries || 0);

    writeQueries += Number(row?.sum?.writeQueries || 0);

  }

  return { readQueries, writeQueries };

}



function classifyKvAction(action) {
  const a = String(action || '').toLowerCase();
  if (a.includes('read') || a.includes('list') || a.includes('get')) return 'read';
  if (a.includes('writ') || a.includes('put') || a.includes('delet')) return 'write';
  return 'other';
}

function sumKvOperations(groups) {
  let reads = 0;
  let writes = 0;
  for (const row of groups || []) {
    const n = Number(row?.sum?.requests || 0);
    const kind = classifyKvAction(row?.dimensions?.actionType);
    if (kind === 'read') reads += n;
    else if (kind === 'write') writes += n;
  }
  return { reads, writes };
}



async function queryAccountUsage(headers, accountId, window, dateStr) {

  const gqlRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {

    method: 'POST',

    headers,

    body: JSON.stringify({

      query: `query getAccountUsage(

        $accountId: String!

        $datetimeFilter: AccountWorkersInvocationsAdaptiveFilter_InputObject

        $dateStart: Date!

        $dateEnd: Date!

      ) {

        viewer {

          accounts(filter: { accountTag: $accountId }) {

            pagesFunctionsInvocationsAdaptiveGroups(limit: 1000, filter: $datetimeFilter) {

              sum { requests }

            }

            workersInvocationsAdaptive(limit: 10000, filter: $datetimeFilter) {
              sum { requests cpuTimeUs }
            }

            d1AnalyticsAdaptiveGroups(

              filter: { date_geq: $dateStart, date_leq: $dateEnd }

              limit: 100

            ) {

              sum { readQueries writeQueries }

            }

            kvOperationsAdaptiveGroups(

              filter: { date_geq: $dateStart, date_leq: $dateEnd }

              limit: 100

            ) {

              dimensions { actionType }

              sum { requests }

            }

          }

        }

      }`,

      variables: {

        accountId,

        datetimeFilter: { datetime_geq: window.since, datetime_leq: window.until },

        dateStart: dateStr,

        dateEnd: dateStr,

      },

    }),

  });



  const gqlJson = await gqlRes.json().catch(() => ({}));

  if (!gqlRes.ok || gqlJson?.errors?.length) {

    const msg = gqlJson?.errors?.[0]?.message || `GraphQL HTTP ${gqlRes.status}`;

    throw new AppError(msg, 502);

  }



  const acc = gqlJson?.data?.viewer?.accounts?.[0];

  if (!acc) {

    throw new AppError('未找到 Cloudflare 账号用量数据', 502);

  }



  const pages = sumAdaptiveRequests(acc.pagesFunctionsInvocationsAdaptiveGroups);

  const workersCpu = sumWorkersCpu(acc.workersInvocationsAdaptive);

  const workers = workersCpu.requests;

  const d1 = sumD1Queries(acc.d1AnalyticsAdaptiveGroups);

  const kv = sumKvOperations(acc.kvOperationsAdaptiveGroups);



  return {

    pages,

    workers,

    total: pages + workers,

    avgCpuMs: workersCpu.avgCpuMs,

    d1ReadQueries: d1.readQueries,

    d1WriteQueries: d1.writeQueries,

    kvReadRequests: kv.reads,

    kvWriteRequests: kv.writes,

  };

}



async function queryCronTriggerCount(headers, accountId, scriptName) {

  try {

    const schedules = await cfFetch(

      `/accounts/${accountId}/workers/scripts/${scriptName}/schedules`,

      headers,

    );

    return Array.isArray(schedules) ? schedules.length : FREE_TIER_QUOTAS.cronTriggers;

  } catch {

    return FREE_TIER_QUOTAS.cronTriggers;

  }

}



export async function queryCfUsage(env) {

  const apiToken = await readSecret(env, SECRET_TYPES.CF_API_TOKEN);

  if (!apiToken) {

    throw new AppError('请先配置 CF API Token', 400);

  }



  const headers = {

    Authorization: `Bearer ${apiToken}`,

    'Content-Type': 'application/json',

  };



  const verify = await cfFetch('/user/tokens/verify', headers);

  if (verify?.status !== 'active') {

    throw new AppError('CF API Token 无效或已停用', 502);

  }



  const accounts = await cfFetch('/accounts?per_page=5', headers);

  const accountId = accounts?.[0]?.id;

  const window = getTodayUsageWindow();

  const dateStr = getTodayUtcDateStr();



  if (!accountId) {

    throw new AppError('未找到 Cloudflare 账号', 502);

  }



  const usage = await queryAccountUsage(headers, accountId, window, dateStr);

  const cronTriggersConfigured = await queryCronTriggerCount(

    headers,

    accountId,

    env.WORKER_NAME || 'f-ui',

  );



  return {

    success: true,

    accounts: (accounts || []).map((a) => ({ id: a.id, name: a.name })),

    workersRequests24h: usage.workers,

    pagesRequests24h: usage.pages,

    totalRequestsToday: usage.total,

    dailyQuota: FREE_TIER_QUOTAS.workersRequests,

    workersAvgCpuMs: Number(usage.avgCpuMs.toFixed(2)),

    workersCpuQuotaMs: FREE_TIER_QUOTAS.workersCpuMsPerRequest,

    d1ReadQueriesToday: usage.d1ReadQueries,

    d1WriteQueriesToday: usage.d1WriteQueries,

    d1ReadQuota: FREE_TIER_QUOTAS.d1Reads,

    d1WriteQuota: FREE_TIER_QUOTAS.d1Writes,

    kvReadRequestsToday: usage.kvReadRequests,

    kvWriteRequestsToday: usage.kvWriteRequests,

    kvReadQuota: FREE_TIER_QUOTAS.kvReads,

    kvWriteQuota: FREE_TIER_QUOTAS.kvWrites,

    cronTriggersConfigured,

    cronTriggersQuota: FREE_TIER_QUOTAS.cronTriggers,

    usageWindow: window,

    usageDate: dateStr,

    credentialType: 'api_token',

    queriedAt: new Date().toISOString(),

  };

}



