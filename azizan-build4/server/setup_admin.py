"""Generate or rotate the administrator code on the server. Print once. Never commit it."""
import hashlib
import os
import secrets
import tempfile
from pathlib import Path

OUT = Path(os.environ.get('AZIZAN_ADMIN_HASH', '/opt/azizan-usage/private/admin.sha256'))


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run on the server as root.')
    if OUT.exists():
        raise SystemExit('Admin code already exists. To rotate, back up the hash file privately and use --rotate.')
    token = secrets.token_urlsafe(32)
    digest = hashlib.sha256(token.encode('ascii')).hexdigest()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fd, path = tempfile.mkstemp(prefix='.admin-', dir=OUT.parent)
    try:
        os.fchmod(fd, 0o640)
        import grp
        os.fchown(fd, 0, grp.getgrnam('azizanusage').gr_gid)
        with os.fdopen(fd, 'w') as f:
            f.write(digest + '\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(path, OUT)
    finally:
        if os.path.exists(path):
            os.unlink(path)
    print('ADMINISTRATOR USAGE CODE (SAVE PRIVATELY; SHOWN ONCE):', token)
    print('Never put this code in GitHub, an app binary, URL, or screenshots.')


if __name__ == '__main__':
    import sys
    if '--rotate' in sys.argv:
        if os.geteuid() != 0:
            raise SystemExit('Run as root')
        if OUT.exists():
            # User explicitly invoked rotation. The previous token is revoked.
            OUT.unlink()
    main()
