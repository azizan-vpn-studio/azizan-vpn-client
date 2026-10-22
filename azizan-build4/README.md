# Azizan VPN — Build 4 usage service (staging package)

**Status:** code package, not deployed; do not publish Build 4 until tested on the real server and an actual iPhone. This package does not touch the Outline/Shadowbox Docker containers.

## What it does

* A small Python API reads Outline traffic counters from the already-private `127.0.0.1:9090` Prometheus endpoint.
* User receives a separate random **usage code** (not the `ss://` VPN access key). The API hashes that code and looks it up in a root-managed registry; it selects **only** the associated `access_key` metric label.
* Responds with estimated consumed GB, allowance GB and remaining GB within the explicitly configured UTC period. No keys, passwords or other users' usage are returned.
* Missing monitoring history, missing metrics, expired or not-yet-started periods return unavailable—not misleading zero consumption.
* **Read-only display**: it does NOT create/delete VPN access keys or enforce/shut off an allowance. Outline Manager data-limit enforcement must be managed separately.
* Prometheus `increase()` estimates counter growth and can extrapolate near interval boundaries. It is not billing-grade. At present your monitoring history is shorter than 30 days: **do not create a 30-day allocation starting before actual monitoring began**. The `--monitoring-start` field is a deliberate conservative guard, not an automatically verified retention guarantee.

## Fast local-only install (manual review first)

Download the ZIP to your Windows PC, transfer it to your DigitalOcean VPS via a secure SSH/SCP connection, then extract it outside the public web root. After reviewing `deploy/install-local.sh`, run it as root. The script saves a dated backup, installs the service as an unprivileged Linux account, checks for HTTP 401 without a token, and listens **only** on `127.0.0.1:8765`. It does not open port 443 or modify Outline/Shadowbox. We will help with the transfer once you have the ZIP.

## Prepare a test server installation (manual review first)

1. Back up `/opt/azizan-usage` and its private registry. Do not publish your existing `clients.json`, Outline access keys or Let's Encrypt private key. The working server already has a venv and exploratory files; replace them only after saving a backup and comparing configurations.
2. Copy `server/app.py`, `server/requirements.txt` and `server/create_client.py` to `/opt/azizan-usage/`. Install Python dependencies into that directory's existing venv: `venv/bin/python -m pip install -r requirements.txt`.
3. Keep `/opt/azizan-usage/private` owned `root:azizanusage`, mode `750`; its `clients.json` owner `root:azizanusage`, mode `640` and content `{}` initially. The service runs as unprivileged `azizanusage`. Create the account with `useradd --system --no-create-home --shell /usr/sbin/nologin azizanusage` if needed. Never make the registry web-readable.
4. Check `venv/bin/python -m py_compile app.py create_client.py`. Before starting, test `AZIZAN_REGISTRY=/opt/azizan-usage/private/clients.json venv/bin/python -c 'from app import app; print(app.test_client().get("/usage").status_code)'` and expect `401`.
5. For internal staging install `deploy/azizan-usage.service` as `/etc/systemd/system/azizan-usage.service`, `systemctl daemon-reload`, `systemctl enable --now azizan-usage`; it binds exclusively to `127.0.0.1:8765`. Verify with `curl -fsS http://127.0.0.1:8765/health`. Confirm no conflicts first with `ss -lntp`.
6. **Do not enable public HTTPS until** IP certificate is valid, IP/port checked free, renewal verified and reverse-proxy configuration audited. Use `deploy/nginx-site.conf.template` only after replacing placeholders. The existing short-lived Let's Encrypt IP certificate has a roughly six-day validity; automatic renewal needs testing, and Nginx must reload when replaced. Test server availability with a safe non-user endpoint; then enable TLS and verify with `curl --fail https://SERVER_IP/usage` (expected HTTP 401; curl `--fail` will exit 22). Never use `curl -k` or disable TLS checks in the app.
7. Enable rate limiting as in the Nginx template. Add the renewal deploy hook after reviewing its paths. Do not change existing VPN/SSH/firewall port rules as part of this install.

## Issue one usage code (run as root on server; example dates only)

`venv/bin/python create_client.py --key-id '7' --allowance-gb '10' --period-start '2026-10-23T00:00:00Z' --period-end '2026-10-30T00:00:00Z' --monitoring-start '2026-10-22T00:00:00Z'`

Replace `7` with the exact Outline metric `access_key` label (not a complete VPN URL); use **verified** time boundaries and actual desired allowance. The printed code is shown once: give it privately to the user. Registry contains only its SHA-256 digest. A separate usage code is needed for each person/key. A shared Outline key aggregates all traffic and cannot reliably attribute per-person usage. For revocation, delete its hash entry from `clients.json` securely; this only revokes usage reporting, **not VPN access**.

## Privacy / limitations

* Authentication is bearer-token only, so HTTPS is mandatory outside localhost. Do not put tokens in query strings, URLs, repositories, screenshots or analytics. The example HTTPS frontend allows `Authorization` from the app webview and sends no cookies.
* If you plan to use the same token in a mobile app, store it in native secure storage (iOS Keychain/Android Keystore) and scope it to the chosen server. Do not place tokens in app source code, localStorage or an `ss://` link. The app's frontend still needs separate integration and device testing.
* Rotate token by removing its hash and creating a new allocation after handling the old registry entry. Treat both the server IP and users' access patterns as security-sensitive.
* This API reports only traffic matching the `dir=~"c<p|p>t"` counters observed in the present Outline setup; confirm that metric labels still match after Shadowbox upgrades. It intentionally rejects absent or old metrics.

## Local automated tests

`python -m pip install -r server/requirements.txt pytest && python -m pytest -q tests`

The included tests exercise unauthenticated, bad-token, authorized-per-key, unavailable-metrics, monitoring-failure, and incomplete-window paths without contacting the production server.
