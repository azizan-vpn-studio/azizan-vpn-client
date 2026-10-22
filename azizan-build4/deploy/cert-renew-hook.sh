#!/bin/sh
# Deploy under /etc/letsencrypt/renewal-hooks/deploy after verifying certificate renewals.
set -eu
/usr/sbin/nginx -t && /bin/systemctl reload nginx
