# Personal usage dashboard in Azizan VPN (Build 4 pilot)

The app card shows **used**, **allowance**, and **remaining** gigabytes for the key associated with a separate, private usage code. It cannot select somebody else's key. For privacy, the code is cleared after each lookup, not placed in source, a URL, the Outline access key, localStorage or browser cookies. The pilot asks users to re-enter the code to check again or after restarting the app; native secure one-time pairing is a possible subsequent enhancement. For accurate per-person data, give each person their own Outline key.

`apply_patch.py` runs at Codemagic build time from this package's fixed location `azizan-build4/client-addon`. It handles both the modern and legacy hero-card templates and removes the earlier placeholder. Generated `azizan_usage_endpoint.ts` is gitignored. `enable_codemagic.py` modifies only the iOS Release workflow, running the patcher before Capacitor sync and setting build number 4.

Set `AZIZAN_USAGE_ENDPOINT` in Codemagic to your valid HTTPS `/usage` URL (for the current pilot: `https://165.245.209.64/usage`). **Never put a user or administrator code into Codemagic.** Audit WebView CSP and ATS for that verified HTTPS endpoint; never disable certificate validation. Check formatting/build locally, then verify in TestFlight before release.
