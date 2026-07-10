export async function resolveServiceDomain(apiFn) {
  try {
    const init = await apiFn('/api/auth/bootstrap');
    if (init?.domain) return init.domain;
  } catch {
    /* ignore */
  }

  try {
    const res = await fetch('/health');
    const json = await res.json();
    if (json?.domain) return json.domain;
  } catch {
    /* ignore */
  }

  const host = window.location.hostname;
  if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  return '';
}

export async function probeNodeLatency(domain, proxyPath, { timeoutMs = 15000 } = {}) {
  if (!domain) {
    return { ok: false, latencyMs: null, status: null, detail: 'domain missing' };
  }

  const path = String(proxyPath || '').replace(/^\/+/, '');
  const url = `https://${domain}/${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - start);
    const ok = res.status === 426;
    return {
      ok,
      latencyMs,
      status: res.status,
      detail: ok ? 'ok' : `HTTP ${res.status}`,
    };
  } catch (e) {
    const latencyMs = Math.round(performance.now() - start);
    const detail = e?.name === 'AbortError' ? 'timeout' : e?.message || 'network error';
    return { ok: false, latencyMs, status: null, detail };
  } finally {
    clearTimeout(timer);
  }
}
