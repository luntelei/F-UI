-- Remove the historical default best-IP template node seeded by migration 0006.
DELETE FROM nodes
WHERE name = 'Default Best Template'
  AND type = 'vless_ws'
  AND proxy_path = 'best-auto'
  AND enabled = 1
  AND sort_order = 0;
