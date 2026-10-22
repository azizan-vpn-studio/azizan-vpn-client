#!/usr/bin/env bash
# Run as root from extracted package on the DigitalOcean host. LOCAL-ONLY installation.
set -euo pipefail
[[ "$(id -u)" == 0 ]] || { echo 'Run as root'; exit 1; }
PACKAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET=/opt/azizan-usage
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$TARGET/private" 
# Back up exploratory code and private registry before changing anything.
backup="/root/azizan-usage-backup-$stamp.tar.gz"
if [[ -d "$TARGET" ]]; then tar -czf "$backup" -C /opt azizan-usage; fi
printf 'Backup: %s\n' "$backup"
if ! id azizanusage >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin azizanusage
fi
install -m 0644 "$PACKAGE_DIR/server/app.py" "$TARGET/app.py"
install -m 0644 "$PACKAGE_DIR/server/create_client.py" "$TARGET/create_client.py"
install -m 0644 "$PACKAGE_DIR/server/requirements.txt" "$TARGET/requirements.txt"
[[ -x "$TARGET/venv/bin/python" ]] || python3 -m venv "$TARGET/venv"
"$TARGET/venv/bin/python" -m pip install -r "$TARGET/requirements.txt"
if [[ ! -f "$TARGET/private/clients.json" ]]; then printf '{}\n' > "$TARGET/private/clients.json"; fi
chown root:azizanusage "$TARGET/private" "$TARGET/private/clients.json"
chmod 0750 "$TARGET/private"
chmod 0640 "$TARGET/private/clients.json"
"$TARGET/venv/bin/python" -m py_compile "$TARGET/app.py" "$TARGET/create_client.py"
(cd "$TARGET" && "$TARGET/venv/bin/python" -c 'from app import app; r=app.test_client().get("/usage"); assert r.status_code == 401, r.json; print("Unauthenticated endpoint rejects correctly: 401")')
install -m 0644 "$PACKAGE_DIR/deploy/azizan-usage.service" /etc/systemd/system/azizan-usage.service
systemctl daemon-reload
systemctl enable --now azizan-usage.service
curl --fail --silent --show-error http://127.0.0.1:8765/health
printf '\nInstalled LOCAL-ONLY service on 127.0.0.1:8765. No public reverse proxy/firewall change made.\n'
