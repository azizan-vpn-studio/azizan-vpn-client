"""Run at build time from repo root. No auth tokens and no API endpoint in git."""
import argparse
import json
import pathlib
import shutil
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent  # package is inside azizan-build4
CARD = ROOT / 'client/web/views/servers_view/server_list_item/server_card'


def change(path, old, new):
    content = path.read_text(encoding='utf-8')
    if new in content:
        return
    if content.count(old) != 1:
        raise RuntimeError(f'Expected exactly one source anchor in {path}; got {content.count(old)}')
    path.write_text(content.replace(old, new, 1), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--endpoint', required=True, help='HTTPS URL e.g. https://your-IP/usage, from CI environment')
    args = parser.parse_args()
    parsed = urlparse(args.endpoint)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.path != '/usage' or parsed.username or parsed.password or parsed.query or parsed.fragment:
        parser.error('endpoint must be a plain HTTPS /usage URL with no credentials/query/fragment')
    if not CARD.is_dir():
        parser.error('Copy client-addon into the ROOT of the azizan-vpn-client repo before running')
    config = CARD / 'azizan_usage_endpoint.ts'
    config.write_text('export const AZIZAN_USAGE_ENDPOINT = ' + json.dumps(args.endpoint) + ';\n', encoding='utf-8')
    shutil.copyfile(pathlib.Path(__file__).with_name('azizan_usage_panel.ts'), CARD / 'azizan_usage_panel.ts')
    modern = CARD / 'index.ts'
    change(modern, "import './server_info_dialog';", "import './server_info_dialog';\nimport './azizan_usage_panel';")
    content = modern.read_text(encoding='utf-8')
    start = content.find('            <div class="azizan-quota">')
    end = content.find('            <div class="card-metadata-connection-type-container">', start)
    if start >= 0 and end > start:
        modern.write_text(content[:start] + '            <azizan-usage-panel .localize=${this.localize}></azizan-usage-panel>\n' + content[end:], encoding='utf-8')
    elif '<azizan-usage-panel' not in content:
        raise RuntimeError('modern card quota block not found')
    legacy = CARD / 'legacy.ts'
    change(legacy, "import './server_info_dialog';", "import './server_info_dialog';\nimport './azizan_usage_panel';")
    # Place the panel *inside* the hero card's button grid area, not as a new grid child.
    change(legacy, '          </label>\n        </div>\n        ${elements.footer}', '          </label>\n          <azizan-usage-panel .localize=${this.localize}></azizan-usage-panel>\n        </div>\n        ${elements.footer}')
    new_messages = {
      'en': {
        'azizan-usage-used': 'Recorded usage', 'azizan-usage-limit': 'Allowance',
        'azizan-usage-estimate': 'Estimate for this period; display only, not enforcement',
        'azizan-usage-code': 'Private usage code', 'azizan-usage-check': 'Check usage',
        'azizan-usage-code-explain': 'Enter the separate usage code given by your access key provider. Not your VPN access key.',
        'azizan-usage-check-failed': 'Could not verify usage. Check your code and connection.'
      },
      'fa': {
        'azizan-usage-used': 'مصرف ثبت‌شده', 'azizan-usage-limit': 'سهمیه',
        'azizan-usage-estimate': 'مقدار تقریبی در این دوره؛ فقط نمایشی و بدون اعمال محدودیت',
        'azizan-usage-code': 'کد خصوصی مصرف', 'azizan-usage-check': 'بررسی مصرف',
        'azizan-usage-code-explain': 'کد جداگانه‌ای را که ارائه‌دهنده به شما داده وارد کنید، نه کلید اتصال VPN.',
        'azizan-usage-check-failed': 'امکان بررسی مصرف وجود ندارد. کد و اتصال را بررسی کنید.'
      },
    }
    for locale, messages in new_messages.items():
        path = ROOT / f'client/web/messages/{locale}.json'
        data = json.loads(path.read_text(encoding='utf-8'))
        data.update(messages)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    ignore = ROOT / '.gitignore'
    ignore_line = '\n/client/web/views/servers_view/server_list_item/server_card/azizan_usage_endpoint.ts\n'
    if ignore_line.strip() not in ignore.read_text(encoding='utf-8'):
        with ignore.open('a', encoding='utf-8') as f:
            f.write(ignore_line)
    print('Build 4 pilot usage panel patched. Endpoint is gitignored. Tokens are never embedded.')


if __name__ == '__main__':
    main()
