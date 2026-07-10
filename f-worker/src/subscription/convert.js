const SUPPORTED_TARGETS = new Set(['mixed', 'clash', 'singbox']);

export function normalizeTarget(raw) {
  const t = String(raw || 'mixed').toLowerCase();
  if (t === 'sing-box') return 'singbox';
  return t;
}

export function isSupportedTarget(target) {
  return SUPPORTED_TARGETS.has(target);
}

export function convertSubscription(env, nodes, targetRaw) {
  const target = normalizeTarget(targetRaw);
  if (!isSupportedTarget(target)) {
    throw new Error('unsupported target');
  }
  if (target === 'clash') {
    return { body: toClashYaml(env, nodes), contentType: 'text/yaml; charset=utf-8' };
  }
  if (target === 'singbox') {
    return { body: JSON.stringify(toSingboxOutbounds(env, nodes), null, 2), contentType: 'application/json; charset=utf-8' };
  }
  const lines = nodes.map((n) => n.vless).join('\n');
  return { body: btoa(lines), contentType: 'text/plain; charset=utf-8' };
}

function yamlStr(value) {
  return JSON.stringify(String(value));
}

function toClashYaml(env, nodes) {
  const domain = env.domain || '';
  const names = nodes.map((n) => n.name);
  let yaml = 'proxies:\n';
  for (const n of nodes) {
    const server = n.server || domain;
    yaml += `  - name: ${yamlStr(n.name)}\n`;
    yaml += '    type: vless\n';
    yaml += `    server: ${yamlStr(server)}\n`;
    yaml += `    port: ${n.port || 443}\n`;
    yaml += `    uuid: ${yamlStr(n.uuid)}\n`;
    yaml += '    network: ws\n';
    yaml += '    tls: true\n';
    yaml += `    servername: ${yamlStr(domain)}\n`;
    yaml += '    udp: true\n';
    yaml += '    ws-opts:\n';
    yaml += `      path: ${yamlStr('/' + n.proxyPath)}\n`;
    yaml += '      headers:\n';
    yaml += `        Host: ${yamlStr(domain)}\n`;
  }
  yaml += 'proxy-groups:\n';
  yaml += '  - name: F-UI\n';
  yaml += '    type: select\n';
  yaml += '    proxies:\n';
  for (const name of names) {
    yaml += `      - ${yamlStr(name)}\n`;
  }
  yaml += 'rules:\n';
  yaml += '  - MATCH,F-UI\n';
  return yaml;
}

function toSingboxOutbounds(env, nodes) {
  const domain = env.domain || '';
  return {
    outbounds: nodes.map((n) => ({
      type: 'vless',
      tag: n.name,
      server: n.server || domain,
      server_port: n.port || 443,
      uuid: n.uuid,
      tls: {
        enabled: true,
        server_name: domain,
      },
      transport: {
        type: 'ws',
        path: `/${n.proxyPath}`,
        headers: { Host: domain },
      },
    })),
  };
}
