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
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__)
REGISTRY = Path(os.environ.get('AZIZAN_REGISTRY', '/opt/azizan-usage/private/clients.json'))
ADMIN_HASH = Path(os.environ.get('AZIZAN_ADMIN_HASH', '/opt/azizan-usage/private/admin.sha256'))
KEY_DIRECTORY = Path(os.environ.get('AZIZAN_KEY_DIRECTORY', '/opt/azizan-usage/private/key_directory.json'))
ADMIN_ASSETS = Path(__file__).resolve().parent / 'admin'
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
    response = requests.get(PROMETHEUS, params={'query': query}, timeout=8)
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
    # App webviews require an authenticated CORS request to /usage only.
    # Never expose the administrator endpoints cross-origin.
    if request.path == '/usage':
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    if request.path.startswith('/admin'):
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Content-Security-Policy'] = (
            "default-src 'none'; script-src 'self'; style-src 'self'; "
            "connect-src 'self'; img-src 'self'; form-action 'none'; "
            "frame-ancestors 'none'; base-uri 'none'"
        )
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


# Administrator interface: separate credential from every user's usage code.
# The API contains no VPN passwords or Outline management credentials.

def admin_authorized(header):
    match = TOKEN_PATTERN.fullmatch(header)
    if match is None:
        return False
    saved = ADMIN_HASH.read_text(encoding='ascii').strip()
    if not re.fullmatch(r'[a-f0-9]{64}', saved):
        raise ValueError('invalid admin credential configuration')
    candidate = hashlib.sha256(match.group(1).encode('ascii')).hexdigest()
    return hmac.compare_digest(saved, candidate)


def read_all_usage():
    query = ('sum by (access_key) (increase('
             'shadowsocks_data_bytes{access_key!="",dir=~"c<p|p>t"}[30d]))')
    response = HTTP.get(PROMETHEUS, params={'query': query}, timeout=8)
    response.raise_for_status()
    data = response.json()
    if data.get('status') != 'success':
        raise ValueError('monitoring query failed')
    result = {}
    now_ts = datetime.now(timezone.utc).timestamp()
    for row in data.get('data', {}).get('result', []):
        ident = row.get('metric', {}).get('access_key')
        values = row.get('value', [])
        if not isinstance(ident, str) or not KEY_PATTERN.fullmatch(ident) or len(values) != 2:
            continue
        try:
            stamp, val = float(values[0]), float(values[1])
        except (TypeError, ValueError):
            continue
        if math.isfinite(val) and val >= 0 and 0 <= now_ts - stamp < 300:
            result[ident] = val
    return result


def admin_summary():
    now = datetime.now(timezone.utc)
    with REGISTRY.open(encoding='utf-8') as f:
        clients = json.load(f)
    with KEY_DIRECTORY.open(encoding='utf-8') as f:
        directory = json.load(f)
    if not isinstance(clients, dict) or not isinstance(directory, dict):
        raise ValueError('invalid registry or key directory')
    recorded = read_all_usage()
    # Include configured keys even if they have no usage yet. Do not call missing data 0.
    keys = {ident: {'key_id': ident, 'name': 'Key ' + ident}
            for ident in set(directory) | set(recorded)}
    for ident, info in directory.items():
        if ident in keys and isinstance(info, dict):
            name = info.get('name')
            if isinstance(name, str) and name.strip():
                keys[ident]['name'] = name[:100]
            outline_limit = info.get('outline_limit_bytes')
            if type(outline_limit) is int and outline_limit > 0:
                keys[ident]['outline_limit_gb'] = round(outline_limit / 1e9, 3)
    for ident, bytes_used in recorded.items():
        keys[ident]['used_gb_30d'] = round(bytes_used / 1e9, 3)
    allocations = {}
    for row in clients.values():
        if not isinstance(row, dict):
            continue
        ident = row.get('key_id')
        if not isinstance(ident, str) or not KEY_PATTERN.fullmatch(ident):
            continue
        entry = keys.setdefault(ident, {'key_id': ident, 'name': 'Key ' + ident})
        try:
            start = iso_utc(row['period_start'])
            end = iso_utc(row['period_end'])
            monitor_start = iso_utc(row['monitoring_start'])
            limit = int(row['allowance_bytes'])
            valid = monitor_start <= start <= now < end and 0 < limit <= 10**15
        except (KeyError, ValueError, TypeError, OverflowError):
            valid = False
        if not valid:
            continue
        # One active allocation per key. This app never invents allowance values.
        entry['allowance_gb'] = round(limit / 1e9, 3)
        entry['period_end'] = end.isoformat()
        allocations[ident] = (start, limit)
    # Independent private Prometheus queries are bounded and parallelized so
    # several allocations cannot serialize into a long admin-page load.
    if allocations:
        with ThreadPoolExecutor(max_workers=min(12, len(allocations))) as pool:
            futures = {pool.submit(read_usage, ident, start, now): (ident, limit)
                       for ident, (start, limit) in allocations.items()}
            for future in as_completed(futures):
                ident, limit = futures[future]
                try:
                    used = future.result()
                except (requests.RequestException, ValueError, TypeError, KeyError):
                    app.logger.warning('monitoring unavailable for an allocation')
                    used = None
                if used is not None:
                    keys[ident]['period_used_gb'] = round(used / 1e9, 3)
                    keys[ident]['remaining_gb'] = round(max(0, limit - used) / 1e9, 3)
    sorted_rows = sorted(keys.values(), key=lambda x: (not x['key_id'].isdigit(), int(x['key_id']) if x['key_id'].isdigit() else x['key_id']))
    return {
        'keys': sorted_rows,
        'configured_keys': len(directory),
        'keys_with_recorded_traffic': len(recorded),
        'recorded_gb_30d': round(sum(recorded.values()) / 1e9, 3),
        'updated_at': now.isoformat(),
        'estimated': True,
        'enforced': False,
        'notice': 'Per-access-key estimates. Missing data is unavailable. No online-user count or limit enforcement.',
    }


@app.get('/admin')
def admin_page():
    return send_from_directory(ADMIN_ASSETS, 'index.html')


@app.get('/admin/app.js')
def admin_javascript():
    response = send_from_directory(ADMIN_ASSETS, 'app.js')
    response.mimetype = 'application/javascript'
    return response


@app.get('/admin/app.css')
def admin_styles():
    return send_from_directory(ADMIN_ASSETS, 'app.css')


@app.get('/admin/api')
def admin_api():
    try:
        permitted = admin_authorized(request.headers.get('Authorization', ''))
    except (OSError, ValueError):
        app.logger.warning('administrator credential unavailable')
        return jsonify(error='service unavailable'), 503
    if not permitted:
        return jsonify(error='unauthorized'), 401
    try:
        return jsonify(admin_summary())
    except (OSError, ValueError, TypeError, requests.RequestException):
        app.logger.exception('administrator dashboard monitoring unavailable')
        return jsonify(error='monitoring temporarily unavailable'), 503
