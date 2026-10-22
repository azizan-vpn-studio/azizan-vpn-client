#!/usr/bin/env bash
# Execute as root from the sparse GitHub checkout after reviewing. Does NOT touch Shadowbox.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run as root'; exit 1; }
SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET=/opt/azizan-usage
SITE=/etc/nginx/sites-available/azizan-usage
[[ -f "$SITE" && -x "$TARGET/venv/bin/python" ]] || { echo 'Existing Build 4 API and Nginx site required'; exit 1; }
# Tests are run against the NEW source before any live-file replacement.
(cd "$SOURCE" && "$TARGET/venv/bin/python" -m pytest -q tests)
"$TARGET/venv/bin/python" -m py_compile "$SOURCE/server/app.py" "$SOURCE/server/setup_admin.py" "$SOURCE/server/sync_keys.py"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="/root/azizan-pre-admin-$STAMP.tar.gz"
tar -czf "$BACKUP" -C /opt azizan-usage
cp -p "$SITE" "$SITE.backup-$STAMP"
printf 'Previous API backup: %s\nPrevious Nginx backup: %s\n' "$BACKUP" "$SITE.backup-$STAMP"
install -m 0644 "$SOURCE/server/app.py" "$TARGET/app.py"
install -m 0644 "$SOURCE/server/create_client.py" "$TARGET/create_client.py"
install -m 0644 "$SOURCE/server/issue_all.py" "$TARGET/issue_all.py"
chown root:azizanusage "$TARGET/private/clients.json"
chmod 0640 "$TARGET/private/clients.json"
install -m 0644 "$SOURCE/server/setup_admin.py" "$TARGET/setup_admin.py"
install -m 0644 "$SOURCE/server/sync_keys.py" "$TARGET/sync_keys.py"
install -d -m 0755 "$TARGET/admin"
install -m 0644 "$SOURCE/server/admin/index.html" "$TARGET/admin/index.html"
install -m 0644 "$SOURCE/server/admin/app.js" "$TARGET/admin/app.js"
install -m 0644 "$SOURCE/server/admin/app.css" "$TARGET/admin/app.css"
# Safe metadata snapshot from root-owned Outline config; never copies keys/passwords.
"$TARGET/venv/bin/python" "$TARGET/sync_keys.py"
# Installer preserves the existing user registry, so previous usage codes remain valid.
if [[ ! -f "$TARGET/private/admin.sha256" ]]; then
  "$TARGET/venv/bin/python" "$TARGET/setup_admin.py"
else
  echo 'Existing administrator credential retained; it was not rotated.'
fi
"$TARGET/venv/bin/python" -m py_compile "$TARGET/app.py" "$TARGET/create_client.py" "$TARGET/issue_all.py" "$TARGET/sync_keys.py" "$TARGET/setup_admin.py"
# Same service; replace only its API workers, never Shadowbox or Docker.
systemctl restart azizan-usage
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --show-error http://127.0.0.1:8765/health >/dev/null 2>&1; then break; fi
  sleep 1
done
curl --fail --silent --show-error http://127.0.0.1:8765/health >/dev/null
[[ $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/admin/api) == 401 ]]
# Modify ONLY the previously verified Azizan site. Backup and rollback on syntax failure.
python3 - "$SITE" <<'PY'
from pathlib import Path
import sys
site=Path(sys.argv[1]); content=site.read_text()
if 'location = /admin/api' not in content:
    anchor='    location = /health {'
    if content.count(anchor) != 1:
        raise SystemExit('Nginx config layout changed; refusing automatic modification')
    additions='''    # Private administrator panel. Separate admin bearer token; no access-key passwords.
    location = /admin { proxy_pass http://127.0.0.1:8765; access_log off; }
    location = /admin/app.js { proxy_pass http://127.0.0.1:8765; access_log off; }
    location = /admin/app.css { proxy_pass http://127.0.0.1:8765; access_log off; }
    location = /admin/api {
        limit_req zone=azizan_usage burst=8 nodelay;
        proxy_pass http://127.0.0.1:8765;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        access_log off;
    }
'''
    site.write_text(content.replace(anchor, additions + anchor, 1))
PY
if ! nginx -t; then
  cp -p "$SITE.backup-$STAMP" "$SITE"
  nginx -t
  echo 'Nginx change reverted; previous HTTPS site preserved.' >&2
  exit 1
fi
systemctl reload nginx
install -m 0644 "$SOURCE/deploy/azizan-key-sync.service" /etc/systemd/system/azizan-key-sync.service
install -m 0644 "$SOURCE/deploy/azizan-key-sync.timer" /etc/systemd/system/azizan-key-sync.timer
systemctl daemon-reload
systemctl enable --now azizan-key-sync.timer
printf '\nAdmin panel installed at https://165.245.209.64/admin\n'
printf 'The API remains protected. Store the ADMINISTRATOR USAGE CODE privately; do NOT screenshot it.\n'
printf 'User codes already issued remain valid. No VPN container or access key was changed.\n'
