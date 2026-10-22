# Azizan VPN Build 4 — administrator + personal dashboards

This update adds TWO separate views:

1. **Owner:** `https://YOUR-IP/admin` — private read-only web dashboard showing all configured Outline keys, each available rolling-30-day traffic estimate, an Outline cap when set, and each configured allocation's period usage, allowance, and remaining GB. It uses a separate 43-character administrator code and cannot be accessed with an ordinary user's usage code. Configured keys without traffic appear as *Unavailable*, never as 0. An hourly safe key-directory refresh picks up renamed/new Outline keys. A shared Outline key combines users' traffic; for per-person figures, give each person their own Outline key.
2. **Each person:** a card inside the Azizan VPN app displaying used GB, allowance, and remaining GB for the one key associated with their **private usage code**. The pilot asks for the code when checking; it is not stored on the phone or in GitHub. After verification, native secure one-time pairing can be developed as a separate enhancement.

Traffic is an **estimate**, limited by actual Prometheus monitoring history. The dashboard does not enforce data limits or report how many people are online. A separate server-side usage code is needed for each access key with a valid monitoring/allowance period. An Outline key's existing data cap is not automatically the same as the dashboard's reporting-period allowance.

## What to do after updating the GitHub feature branch

**Do not run the install script until the source is updated on your server and the new tests pass.** On the DigitalOcean terminal, update the sparse checkout:

```bash
git -C /root/azizan-build4-source pull --ff-only
```

Then run the prepared upgrade command (do not screenshot or share its administrator token output):

```bash
bash /root/azizan-build4-source/azizan-build4/deploy/upgrade-admin.sh
```

The script runs all tests *before* replacing the live API, saves dated backups of both the API and Nginx site, preserves already issued personal codes, extracts **only safe names and IDs** from the root-owned Outline configuration, generates an administrator code once, installs the HTML/CSS/JS, restarts **only** the usage API, and tests Nginx before reloading it. It does not touch Shadowbox, its containers, user VPN keys, SSH, or firewall rules. Nginx's `/usage` endpoint stays intact. The admin hash remains root:azizanusage (0640) in `/opt/azizan-usage/private/admin.sha256`.

Open `https://165.245.209.64/admin` after a successful upgrade. Type the new administrator code **only into the administrator page**. Keep this code private. User usage codes cannot enter that dashboard. The admin page stores its code only in memory for the open tab and clears it on sign-out/reload.

## Personal app build — only after server verification

The patcher is staged at `azizan-build4/client-addon/apply_patch.py`, and supports both the existing modern dashboard and legacy hero card (including the locally saved placeholder). It creates a gitignored endpoint config at build time and displays personal figures after a user enters their separate usage code. **No VPN keys or private usage codes go into the app binary or GitHub.**

When ready, prepare Codemagic via:

```bash
python3 azizan-build4/client-addon/enable_codemagic.py
```

Set `AZIZAN_USAGE_ENDPOINT` to `https://165.245.209.64/usage` under the Codemagic workflow's environment variables. This is an **endpoint, not a credential**. Codemagic will run the patcher before the iOS build and set `CURRENT_PROJECT_VERSION=4`. Confirm the application WebView CSP/iOS ATS permits valid HTTPS IP connections; never use `curl -k` or bypass TLS checks. Run the web build and TestFlight QA before telling users to upgrade. Do not merge or release based solely on a successful build.

The old TestFlight Build 3 is unaffected until a new release is explicitly initiated.

## Operational notes

- Open: `https://165.245.209.64/admin` (admin code required for data).
- `/usage` remains per-user and returns only that code's assigned access key. A separate code is required for each person.
- New keys/names are refreshed hourly by `azizan-key-sync.timer` (can also run `sudo /opt/azizan-usage/venv/bin/python /opt/azizan-usage/sync_keys.py`).
- All code is in the repo; root-owned server registry, admin digest, user codes, live VPN config and certificate private key are **never** committed.
- Current short-lived certificate renewal was already simulated successfully; keep Certbot renewal and Nginx reload hook enabled.
- Your previously shared `ss://` test key should be rotated before redistribution. No need to use that connection password for usage reporting.

## Optional: issue individual usage codes for your other configured users in one batch

The administrator panel lists all configured keys **without any personal usage code**. For each person to view their own usage **inside their own app**, issue one separate read-only code per key. After verifying the monitoring-start date and choosing an explicit, active reporting period, the root-only bulk tool can do this in one command:

```bash
cd /opt/azizan-usage && venv/bin/python issue_all.py --period-start 2026-10-22T00:00:00Z --period-end 2026-10-29T00:00:00Z --monitoring-start 2026-10-22T00:00:00Z --default-allowance-gb 10
```

**Dates above are only an example**, not a verified future allocation. The bulk tool uses the key's existing Outline cap where available and uses the explicitly specified default only for uncapped keys. It preserves existing registrations such as your test key and prints only the location of a **root-only 0600 file** holding the newly generated personal codes; no code is printed in the terminal or committed to GitHub. Share each code privately with only its assigned user. Allowance figures are display-only, not Outline enforcement. Re-run `sync_keys.py` if new keys have just been created and the hourly refresh has not yet run.
