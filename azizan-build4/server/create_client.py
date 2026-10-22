"""Run on the server as root. Never commit the output token or clients.json."""
import argparse
import fcntl
import hashlib
import json
import os
import secrets
import tempfile
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

REGISTRY = Path(os.environ.get('AZIZAN_REGISTRY', '/opt/azizan-usage/private/clients.json'))


def parse_utc(s):
    d = datetime.fromisoformat(s.replace('Z', '+00:00'))
    if d.tzinfo is None:
        raise argparse.ArgumentTypeError('UTC timezone required, e.g. 2026-10-23T00:00:00Z')
    return d.astimezone(timezone.utc)


def main():
    parser = argparse.ArgumentParser(description='Create one read-only usage code')
    parser.add_argument('--key-id', required=True, help='Outline metric access_key label, NOT the ss:// key')
    parser.add_argument('--allowance-gb', required=True, help='Decimal GB for this period')
    parser.add_argument('--period-start', required=True, type=parse_utc)
    parser.add_argument('--period-end', required=True, type=parse_utc)
    parser.add_argument('--monitoring-start', required=True, type=parse_utc, help='Earliest verified available metrics time')
    args = parser.parse_args()
    if not (args.key_id.replace('_', '').replace('-', '').isalnum() and 1 <= len(args.key_id) <= 128):
        parser.error('invalid key ID')
    try:
        allowance = int(Decimal(args.allowance_gb) * Decimal(1_000_000_000))
    except (InvalidOperation, ValueError, OverflowError):
        parser.error('invalid allowance')
    if not (0 < allowance <= 10**15):
        parser.error('allowance outside permitted range')
    if not args.monitoring_start <= args.period_start < args.period_end:
        parser.error('period must be covered by reliable monitoring history')
    REGISTRY.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
    lock_path = REGISTRY.parent / 'clients.lock'
    with lock_path.open('a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        registry = json.loads(REGISTRY.read_text()) if REGISTRY.exists() else {}
        if any(row.get('key_id') == args.key_id and row.get('period_end') == args.period_end.isoformat() for row in registry.values()):
            parser.error('this key and period already have a token; revoke the old token first')
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode('ascii')).hexdigest()
        registry[digest] = {
            'key_id': args.key_id,
            'allowance_bytes': allowance,
            'period_start': args.period_start.isoformat(),
            'period_end': args.period_end.isoformat(),
            'monitoring_start': args.monitoring_start.isoformat(),
        }
        fd, path = tempfile.mkstemp(prefix='.clients-', dir=REGISTRY.parent)
        try:
            os.fchmod(fd, 0o640)
            with os.fdopen(fd, 'w') as f:
                json.dump(registry, f, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(path, REGISTRY)
        finally:
            if os.path.exists(path):
                os.unlink(path)
    print('Usage code (share privately once; not stored in plaintext):', token)
    print('Keep this code separate from the Outline access key; it is READ-ONLY.')


if __name__ == '__main__':
    main()
