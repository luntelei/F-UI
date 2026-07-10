-- Seed one enabled VLESS template node so cached best IPs can become subscription nodes
-- without requiring the first administrator to create a node manually.
INSERT INTO nodes (
  name,
  type,
  proxy_path,
  config_json,
  enabled,
  sort_order,
  created_at,
  updated_at
)
SELECT
  'Default Best Template',
  'vless_ws',
  'best-auto',
  '{"uuid":"' ||
    lower(substr(hex(randomblob(16)), 1, 8)) || '-' ||
    lower(substr(hex(randomblob(16)), 1, 4)) || '-' ||
    lower(substr(hex(randomblob(16)), 1, 4)) || '-' ||
    lower(substr(hex(randomblob(16)), 1, 4)) || '-' ||
    lower(substr(hex(randomblob(16)), 1, 12)) ||
  '"}',
  1,
  0,
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM nodes);
