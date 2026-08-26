"""Opt-in real evidence/validator smoke test for hosted StudioNet.

Set STREAKPACT_TEST_EVIDENCE_URL to an approved public IPFS or Arweave URL.
The artifact should be JSON or text that clearly states completed=true and
duration_minutes >= 30 for a documented reading activity.
"""

import hashlib
import os
import time
import urllib.request

import pytest
from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_succeeded

EVIDENCE_URL = os.environ.get("STREAKPACT_TEST_EVIDENCE_URL", "").strip()
EVIDENCE_TITLE = os.environ.get(
    "STREAKPACT_TEST_EVIDENCE_TITLE", "StudioNet immutable reading proof"
).strip()
EVIDENCE_CRITERIA = os.environ.get(
    "STREAKPACT_TEST_EVIDENCE_CRITERIA",
    (
        "Evidence must be a documented reading activity record that explicitly states "
        "completed=true and duration_minutes of at least 30 for this pact period."
    ),
).strip()
EVIDENCE_NOTE = os.environ.get(
    "STREAKPACT_TEST_EVIDENCE_NOTE",
    "This public artifact is the exact immutable activity record for period one.",
).strip()
APPROVED_PREFIXES = (
    "https://ipfs.io/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
    "https://arweave.net/",
)
STAKE = 10**15
PERIOD_SECS = 60
APPEAL_WINDOW_SECS = 300


def _fetch_evidence(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "StreakPact-StudioNet-Smoke/2.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read(100_001)
    if not body or len(body) > 100_000:
        raise AssertionError("evidence fixture must contain 1 to 100,000 bytes")
    return body


def _wait_until(unix_ts: int) -> None:
    while time.time() < unix_ts + 2:
        time.sleep(5)


@pytest.mark.slow
@pytest.mark.skipif(not EVIDENCE_URL, reason="STREAKPACT_TEST_EVIDENCE_URL is not configured")
def test_real_content_addressed_evidence_reaches_consensus_on_studionet():
    assert EVIDENCE_URL.startswith(APPROVED_PREFIXES)
    evidence = _fetch_evidence(EVIDENCE_URL)
    digest = hashlib.sha256(evidence).hexdigest()

    factory = get_contract_factory("StreakPactV2")
    alice, bob = get_accounts()[0], get_accounts()[1]
    contract = factory.deploy(args=[alice.address, 0, PERIOD_SECS, APPEAL_WINDOW_SECS])
    start = int(time.time()) + 180
    create_tx = contract.create_pact(
        args=[
            "SELF",
            EVIDENCE_TITLE,
            EVIDENCE_CRITERIA,
            3,
            1,
            start,
            bob.address,
        ]
    ).transact(value=STAKE)
    assert tx_execution_succeeded(create_tx)

    listing = contract.list_user_pacts(args=[alice.address, 0, 25]).call()
    pact_id = listing["items"][-1]["id"]
    _wait_until(start)

    checkin_tx = contract.submit_checkin(
        args=[
            pact_id,
            EVIDENCE_URL,
            digest,
            EVIDENCE_NOTE,
        ]
    ).transact()
    assert tx_execution_succeeded(checkin_tx)

    pact = contract.get_pact(args=[pact_id]).call()
    checkin = contract.get_checkin(args=[pact_id, 0]).call()
    assert pact["kept_count"] == "1"
    assert checkin["verdict"] == "KEPT"
    assert checkin["content_digest"] == digest
