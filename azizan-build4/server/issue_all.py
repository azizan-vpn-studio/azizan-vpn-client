"""Root-only pilot enrollment of configured Outline keys; tokens written to /root (never stdout)."""
import argparse
import fcntl
import grp
import hashlib
import json
import os
import secrets
import tempfile
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from create_client import REGISTRY, parse_utc

DIRECTORY = Path(os.environ.get('AZIZAN_KEY_DIRECTORY', '/opt/azizan-usage/private/key_directory.json'))


def main():
    parser = argparse.ArgumentParser(description='Issue separate personal usage codes for configured keys')
    parser.add_argument('--period-start', type=parse_utc, required=True)
    parser.add_argument('--period-end', type=parse_utc, required=True)
    parser.add_argument('--monitoring-start', type=parse_utc, required=True)
    parser.add_argument('--default-allowance-gb', help='Explicit pilot allowance for keys with no Outline dataLimit')
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('run as root on your server')
    now = datetime.now(timezone.utc)
    if not args.monitoring_start <= args.period_start <= now < args.period_end:
        parser.error('period must be active and covered by verified monitoring history')
    fallback = None
    if args.default_allowance_gb is not None:
        try:
            fallback = int(Decimal(args.default_allowance_gb) * 1_000_000_000)
        except (InvalidOperation, ValueError, OverflowError):
            parser.error('invalid default allowance')
        if not 0 < fallback <= 10**15:
            parser.error('default allowance outside permitted range')
    directory = json.loads(DIRECTORY.read_text(encoding='utf-8'))
    if not isinstance(directory, dict) or not directory:
        parser.error('no key-directory snapshot; run sync_keys.py first')
    REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    with (REGISTRY.parent / 'clients.lock').open('a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        clients = json.loads(REGISTRY.read_text(encoding='utf-8')) if REGISTRY.exists() else {}
        if not isinstance(clients, dict):
            parser.error('invalid client registry')
        existing = {(row.get('key_id'), row.get('period_end')) for row in clients.values() if isinstance(row, dict)}
        pending = {}
        for ident, info in directory.items():
            if not isinstance(info, dict) or not isinstance(ident, str):
                continue
            if (ident, args.period_end.isoformat()) in existing:
                continue
            allowance = info.get('outline_limit_bytes') or fallback
            if type(allowance) is not int or not 0 < allowance <= 10**15:
                continue
            token = secrets.token_urlsafe(32)
            digest = hashlib.sha256(token.encode('ascii')).hexdigest()
            clients[digest] = {
                'key_id': ident, 'allowance_bytes': allowance,
                'period_start': args.period_start.isoformat(),
                'period_end': args.period_end.isoformat(),
                'monitoring_start': args.monitoring_start.isoformat(),
            }
            pending[ident] = (str(info.get('name') or 'Key '+ident)[:100], token, allowance)
        if not pending:
            print('No new codes needed. Existing registrations were preserved.')
            return
        output = Path('/root/azizan-usage-codes-' + now.strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3) + '.txt')
        fd, temp_path = tempfile.mkstemp(prefix='.clients-', dir=REGISTRY.parent)
        try:
            # Create owner-only output BEFORE committing registry, so its failure leaves no issued tokens.
            out_fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(out_fd, 'w', encoding='utf-8') as out:
                    out.write('AZIZAN VPN PERSONAL USAGE CODES — KEEP PRIVATE. NOT VPN ACCESS KEYS.\n')
                    out.write('Display-only estimate; allowance period: '+args.period_start.isoformat()+' to '+args.period_end.isoformat()+'\n\n')
                    for ident, (name, token, allowance) in sorted(pending.items()):
                        out.write(f'{name} (key ID {ident}) | allowance {allowance/1e9:g} GB | usage code: {token}\n')
                    out.flush(); os.fsync(out.fileno())
            except BaseException:
                output.unlink(missing_ok=True)
                raise
            os.fchmod(fd, 0o640)
            os.fchown(fd, 0, grp.getgrnam('azizanusage').gr_gid)
            with os.fdopen(fd, 'w', encoding='utf-8') as dst:
                json.dump(clients, dst, indent=2)
                dst.flush(); os.fsync(dst.fileno())
            fd = -1
            os.replace(temp_path, REGISTRY)
        except BaseException:
            output.unlink(missing_ok=True)
            raise
        finally:
            if fd >= 0:
                os.close(fd)
            if os.path.exists(temp_path):
                os.unlink(temp_path)
    print('Issued', len(pending), 'new personal usage codes; previously issued codes preserved.')
    print('Codes stored ONLY in root-owned file:', output)
    print('Open it privately on the server and give each person ONLY their own code. Never share the file or screenshot it.')


if __name__ == '__main__':
    main()
