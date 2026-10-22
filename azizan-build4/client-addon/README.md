# Optional Build 4 pilot iPhone panel

**Not yet compiled or device tested.** Requires an operational HTTPS API, a current valid IP TLS certificate, and real usage codes. Keep Build 3 working until this is verified.

This is a pilot UI with an intentionally **ephemeral** usage code: users enter a separate code to check their figures; the code is cleared from the input after a request and is not written to localStorage, an Outline `ss://` link or a repo file. The backend identifies the correct access key from the hashed code; the app cannot choose another user's key.

To use it, copy the whole `client-addon` directory into the root of the GitHub repository's working directory. At build time run from repo root:

`python3 client-addon/apply_patch.py --endpoint "$AZIZAN_USAGE_ENDPOINT"`

Set `AZIZAN_USAGE_ENDPOINT` as an environment variable in Codemagic, for example `https://YOUR_VALID_CERTIFICATE_IP/usage`. Do not commit the generated `azizan_usage_endpoint.ts`; the patcher adds it to `.gitignore`. Modify the release workflow's **Prepare and synchronize iOS project** step to run the patcher before `npm run action client/capacitor/build ios`, and change `CURRENT_PROJECT_VERSION` from 3 to 4 **only after testing**. Run npm formatting/build and iPhone TestFlight QA. Verify the Cordova/Capacitor WebView's Content Security Policy and iOS App Transport Security permit verified HTTPS requests to your chosen host; never disable TLS verification.

The addon is deliberately a separate staging patch because GitHub rejected branch creation in this session (403); no repository contents were changed. Its source anchors target the existing `feature/azizan-connection-dashboard` branch and should be reviewed if that branch evolves. A public app binary will reveal the API endpoint to anyone who inspects it; bearer-code authentication and rate limiting must remain enforced.
