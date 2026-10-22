import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest

from server import app as module
from server.sync_keys import make_directory


@pytest.fixture
def admin_client(tmp_path, monkeypatch):
    token = 'A' * 43
    user_token = 'U' * 43
    admin_hash = tmp_path / 'admin.sha256'
    admin_hash.write_text(hashlib.sha256(token.encode()).hexdigest() + '\n')
    directory = tmp_path / 'key_directory.json'
    directory.write_text(json.dumps({'8': {'name': 'Azizan-Test-1', 'outline_limit_bytes': 1_000_000_000},
                                     '9': {'name': 'Another tester'}}))
    now = datetime.now(timezone.utc)
    registry = tmp_path / 'clients.json'
    registry.write_text(json.dumps({hashlib.sha256(user_token.encode()).hexdigest(): {
        'key_id': '8', 'allowance_bytes': 1_000_000_000,
        'period_start': (now-timedelta(hours=1)).isoformat(),
        'period_end': (now+timedelta(days=1)).isoformat(),
        'monitoring_start': (now-timedelta(days=1)).isoformat(),
    }}))
    monkeypatch.setattr(module, 'ADMIN_HASH', admin_hash)
    monkeypatch.setattr(module, 'KEY_DIRECTORY', directory)
    monkeypatch.setattr(module, 'REGISTRY', registry)
    monkeypatch.setattr(module, 'read_all_usage', lambda: {'8': 200_000_000, '10': 300_000_000})
    monkeypatch.setattr(module, 'read_usage', lambda key, start, end: 200_000_000 if key == '8' else None)
    module.app.config['TESTING'] = True
    return module.app.test_client(), token, user_token


def test_admin_requires_distinct_token(admin_client):
    c, token, user_token = admin_client
    assert c.get('/admin/api').status_code == 401
    assert c.get('/admin/api', headers={'Authorization': 'Bearer '+user_token}).status_code == 401
    assert c.get('/admin/api', headers={'Authorization': 'Bearer '+'X'*43}).status_code == 401
    assert c.get('/admin/api', headers={'Authorization': 'Bearer '+token}).status_code == 200


def test_admin_lists_all_keys_and_respects_absent_metrics(admin_client):
    c, token, user_token = admin_client
    r = c.get('/admin/api', headers={'Authorization': 'Bearer '+token})
    assert r.status_code == 200
    assert r.json['configured_keys'] == 2
    assert r.json['keys_with_recorded_traffic'] == 2
    assert r.json['recorded_gb_30d'] == 0.5
    rows = {k['key_id']: k for k in r.json['keys']}
    assert set(rows) == {'8', '9', '10'}
    assert rows['8']['name'] == 'Azizan-Test-1'
    assert rows['8']['period_used_gb'] == 0.2
    assert rows['8']['remaining_gb'] == 0.8
    assert 'used_gb_30d' not in rows['9']  # Unavailable, never invented zero.
    assert 'allowance_gb' not in rows['10']
    assert 'password' not in str(r.json)
    assert r.headers['Cache-Control'].startswith('no-store')
    assert 'Access-Control-Allow-Origin' not in r.headers
    # Administrator code cannot be substituted for a user's usage code.
    assert c.get('/usage', headers={'Authorization': 'Bearer '+token}).status_code == 401


def test_admin_frontend_headers(admin_client):
    c, _, _ = admin_client
    page = c.get('/admin')
    assert page.status_code == 200
    assert "default-src 'none'" in page.headers['Content-Security-Policy']
    assert page.headers['X-Frame-Options'] == 'DENY'
    assert c.get('/admin/app.js').status_code == 200
    assert c.get('/admin/app.css').status_code == 200


def test_admin_config_failure_is_not_an_auth_bypass(admin_client, monkeypatch, tmp_path):
    c, token, _ = admin_client
    monkeypatch.setattr(module, 'ADMIN_HASH', tmp_path / 'missing-admin.sha256')
    assert c.get('/admin/api', headers={'Authorization': 'Bearer '+token}).status_code == 503


def test_key_snapshot_never_contains_password():
    data = {'accessKeys': [
        {'id': 8, 'name': 'Azizan-Test-1', 'password': 'secret', 'port': 10375, 'dataLimit': {'bytes': 1_000_000_000}},
        {'id': 9, 'name': '', 'password': 'another-secret'},
    ]}
    result = make_directory(data)
    assert result == {'8': {'name': 'Azizan-Test-1', 'outline_limit_bytes': 1_000_000_000}, '9': {'name': 'Key 9'}}
    assert 'secret' not in str(result)


def test_admin_prometheus_query_is_aggregated_and_filters_bad_rows(monkeypatch):
    now = datetime.now(timezone.utc).timestamp()
    class FakeResponse:
        def raise_for_status(self):
            pass
        def json(self):
            return {'status': 'success', 'data': {'result': [
                {'metric': {'access_key': '8'}, 'value': [now, '123456789']},
                {'metric': {'access_key': 'bad"id'}, 'value': [now, '44']},
                {'metric': {'access_key': '9'}, 'value': [now, 'NaN']},
            ]}}
    def fake_get(url, params, timeout):
        assert url.startswith('http://127.0.0.1:9090/')
        assert 'sum by (access_key)' in params['query']
        assert 'dir=~"c<p|p>t"' in params['query']
        return FakeResponse()
    monkeypatch.setattr(module.HTTP, 'get', fake_get)
    assert module.read_all_usage() == {'8': 123456789.0}
