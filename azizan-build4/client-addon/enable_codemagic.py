"""Add personal usage dashboard at CI build time. Never put personal codes in CI."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent.parent
workflow = ROOT / 'codemagic.yaml'
content = workflow.read_text(encoding='utf-8')
old = '      - name: Prepare and synchronize iOS project\n        script: |\n          npm run action client/capacitor/build ios'
new = ('      - name: Prepare and synchronize iOS project\n'
       '        script: |\n'
       '          : "${AZIZAN_USAGE_ENDPOINT:?Set the HTTPS usage endpoint in Codemagic first}"\n'
       '          python3 azizan-build4/client-addon/apply_patch.py --endpoint "$AZIZAN_USAGE_ENDPOINT"\n'
       '          npm run action client/capacitor/build ios')
if new not in content:
    if content.count(old) != 1:
        raise SystemExit('Expected exactly one iOS release prepare step; refusing to modify the workflow')
    content = content.replace(old, new, 1)
# Build number on ONLY the signed release workflow, not the debug workflow.
old_build = 'CURRENT_PROJECT_VERSION=3'
if content.count(old_build) == 1:
    content = content.replace(old_build, 'CURRENT_PROJECT_VERSION=4', 1)
elif content.count('CURRENT_PROJECT_VERSION=4') != 1:
    raise SystemExit('Review Codemagic iOS build number manually; no changes saved')
workflow.write_text(content, encoding='utf-8')
print('iOS Build 4 workflow prepared. Set AZIZAN_USAGE_ENDPOINT in Codemagic before building.')
