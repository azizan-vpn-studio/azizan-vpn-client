import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest
import requests

from server import app as module


@pytest.fixture
def client(tmp_path, monkeypatch):
    token = 'T' * 43
    now = datetime.now(timezone.utc)
    allocation = {
        'key_id': '7', 'allowance_bytes': 10_000_000_000,
        'period_start': (now - timedelta(hours=2)).isoformat(),
        'period_end': (now + timedelta(days=5)).isoformat(),
        'monitoring_start': (now - timedelta(days=1)).isoformat(),
    }
    registry = tmp_path / 'clients.json'
    registry.write_text(json.dumps({hashlib.sha256(token.encode()).hexdigest(): allocation}))
    monkeypatch.setattr(module, 'REGISTRY', registry)
    module.app.config['TESTING'] = True
    return module.app.test_client(), token, allocation


def test_missing_and_invalid_token(client):
    c, token, _ = client
    assert c.get('/usage').status_code == 401
    assert c.get('/usage', headers={'Authorization': 'Bearer ' + 'X'*43}).status_code == 401


def test_assigned_key_only(client, monkeypatch):
    c, token, _ = client
    def fake_read(key, start, now):
        assert key == '7'
        return 2_500_000_000
    monkeypatch.setattr(module, 'read_usage', fake_read)
    r = c.get('/usage', headers={'Authorization': 'Bearer ' + token})
    assert r.status_code == 200
    assert r.json['used_gb'] == 2.5
    assert r.json['remaining_gb'] == 7.5
    assert r.json['enforced'] is False
    assert 'key_id' not in r.json
    assert r.headers['Cache-Control'].startswith('no-store')


def test_missing_metrics(client, monkeypatch):
    c, token, _ = client
    monkeypatch.setattr(module, 'read_usage', lambda *args: None)
    assert c.get('/usage', headers={'Authorization': 'Bearer ' + token}).status_code == 503


def test_monitor_failure(client, monkeypatch):
    c, token, _ = client
    def failure(*args):
        raise requests.Timeout('unavailable')
    monkeypatch.setattr(module, 'read_usage', failure)
    assert c.get('/usage', headers={'Authorization': 'Bearer ' + token}).json == {'error': 'monitoring temporarily unavailable'}


def test_old_monitoring_window_rejected(client, monkeypatch):
    c, token, row = client
    row['monitoring_start'] = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    module.REGISTRY.write_text(json.dumps({hashlib.sha256(token.encode()).hexdigest(): row}))
    assert c.get('/usage', headers={'Authorization': 'Bearer ' + token}).status_code == 503


def test_preflight(client):
    c, _, _ = client
    assert c.options('/usage').status_code == 204
