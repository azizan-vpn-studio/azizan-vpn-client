"""Private, read-only, per-access-key usage API for Azizan VPN.

No Outline management credentials are needed. This service does not enforce limits.
"""
import hashlib
import hmac
import json
import logging
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)
REGISTRY = Path(os.environ.get('AZIZAN_REGISTRY', '/opt/azizan-usage/private/clients.json'))
PROMETHEUS = os.environ.get('AZIZAN_PROMETHEUS', 'http://127.0.0.1:9090/api/v1/query')
TOKEN_PATTERN = re.compile(r'^Bearer ([A-Za-z0-9_-]{40,256})$')
KEY_PATTERN = re.compile(r'^[A-Za-z0-9_-]{1,128}$')
HTTP = requests.Session()


def iso_utc(value):
    if not isinstance(value, str):
        raise ValueError('invalid date')
    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        raise ValueError('timezone required')
    return dt.astimezone(timezone.utc)


def authenticated_client(header):
    match = TOKEN_PATTERN.fullmatch(header)
    if match is None:
        return None
    digest = hashlib.sha256(match.group(1).encode('ascii')).hexdigest()
    with REGISTRY.open(encoding='utf-8') as f:
        clients = json.load(f)
    if not isinstance(clients, dict):
        raise ValueError('invalid registry')
    selected = None
    # Compare all entries rather than stopping at the first match.
    for saved, client in clients.items():
        if isinstance(saved, str) and len(saved) == 64 and hmac.compare_digest(digest, saved):
            selected = client
    return selected


def read_usage(key_id, start, now):
    if not isinstance(key_id, str) or KEY_PATTERN.fullmatch(key_id) is None:
        raise ValueError('invalid key id')
    seconds = max(60, math.ceil((now - start).total_seconds()))
    # These labels and directions were checked on the installed Outline server.
    query = ('sum(increase(shadowsocks_data_bytes{access_key="' + key_id +
             '",dir=~"c<p|p>t"}[' + str(seconds) + 's]))')
    response = HTTP.get(PROMETHEUS, params={'query': query}, timeout=8)
    response.raise_for_status()
    data = response.json()
    if data.get('status') != 'success':
        raise ValueError('monitoring query failed')
    rows = data.get('data', {}).get('result', [])
    if len(rows) != 1 or len(rows[0].get('value', [])) != 2:
        return None
    stamped, raw = rows[0]['value']
    value = float(raw)
    if not math.isfinite(value) or value < 0 or now.timestamp() - float(stamped) > 300:
        return None
    return value


@app.after_request
def response_headers(response):
    response.headers['Cache-Control'] = 'no-store, max-age=0'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    # Bearer token only; no cross-origin cookies. Needed for the Cordova webview.
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    return response


@app.get('/health')
def health():
    return jsonify(status='ok')


@app.route('/usage', methods=['GET', 'OPTIONS'])
def usage():
    if request.method == 'OPTIONS':
        return '', 204
    try:
        client = authenticated_client(request.headers.get('Authorization', ''))
    except (OSError, ValueError, json.JSONDecodeError):
        app.logger.exception('private client registry unavailable')
        return jsonify(error='service unavailable'), 503
    if client is None:
        return jsonify(error='unauthorized'), 401
    try:
        key_id = client['key_id']
        limit = int(client['allowance_bytes'])
        start = iso_utc(client['period_start'])
        end = iso_utc(client['period_end'])
        monitoring_start = iso_utc(client['monitoring_start'])
        now = datetime.now(timezone.utc)
        if (not isinstance(key_id, str) or KEY_PATTERN.fullmatch(key_id) is None or
                limit <= 0 or limit > 10**15 or not monitoring_start <= start < end or
                not start <= now < end):
            raise ValueError('invalid or inactive allocation')
    except (KeyError, ValueError, TypeError, OverflowError):
        return jsonify(error='allocation unavailable'), 503
    try:
        used = read_usage(key_id, start, now)
    except (requests.RequestException, ValueError, TypeError, KeyError):
        app.logger.exception('monitoring unavailable')
        return jsonify(error='monitoring temporarily unavailable'), 503
    if used is None:
        return jsonify(error='usage unavailable'), 503
    remaining = max(0, limit - used)
    # Display-only estimate. Prometheus increase() interpolates and may lag.
    return jsonify(
        used_gb=round(used / 1e9, 3),
        allowance_gb=round(limit / 1e9, 3),
        remaining_gb=round(remaining / 1e9, 3),
        period_start=start.isoformat(),
        period_end=end.isoformat(),
        updated_at=now.isoformat(),
        estimated=True,
        enforced=False,
    )
