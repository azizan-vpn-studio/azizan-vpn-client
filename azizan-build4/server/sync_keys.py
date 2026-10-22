"""Root-only extraction of safe names/IDs from Shadowbox; never copy passwords."""
import json
import os
import re
import tempfile
from pathlib import Path

SOURCE = Path(os.environ.get('AZIZAN_SHADOWBOX_CONFIG', '/opt/outline/persisted-state/shadowbox_config.json'))
OUTPUT = Path(os.environ.get('AZIZAN_KEY_DIRECTORY', '/opt/azizan-usage/private/key_directory.json'))
KEY = re.compile(r'^[A-Za-z0-9_-]{1,128}$')


def make_directory(config):
    output = {}
    for item in config.get('accessKeys', []):
        if not isinstance(item, dict):
            continue
        ident = str(item.get('id', ''))
        if not KEY.fullmatch(ident):
            continue
        entry = {'name': str(item.get('name') or 'Key ' + ident)[:100]}
        cap = item.get('dataLimit')
        if isinstance(cap, dict):
            cap = cap.get('bytes')
        try:
            cap = int(cap)
            if 0 < cap <= 10**15:
                entry['outline_limit_bytes'] = cap
        except (TypeError, ValueError, OverflowError):
            pass
        output[ident] = entry
    return output


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    data = make_directory(json.loads(SOURCE.read_text(encoding='utf-8')))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fd, path = tempfile.mkstemp(prefix='.keys-', dir=OUTPUT.parent)
    try:
        os.fchmod(fd, 0o640)
        import grp
        os.fchown(fd, 0, grp.getgrnam('azizanusage').gr_gid)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(path, OUTPUT)
    finally:
        if os.path.exists(path):
            os.unlink(path)
    print('Updated safe key directory:', len(data), 'configured keys. No passwords copied.')


if __name__ == '__main__':
    main()
