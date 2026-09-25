"""OutageBond lifecycle, evidence agreement, and threshold-boundary tests."""

import json
import sys
from datetime import datetime, timezone

import pytest

PAYOUT = 10**15
OPERATOR_URL = "https://status.example.com/incidents/42"
MONITOR_URL = "https://monitor.example.net/history/42"
START = 0
END = 0


def _address(value):
    raw = value.as_bytes if hasattr(value, "as_bytes") else value
    return "0x" + raw.hex() if isinstance(raw, bytes) else str(value)


def _warp(vm, timestamp):
    iso = datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
    vm.warp(iso)
    module = sys.modules.get("_contract_outage_bond")
    if module is not None:
        module.gl.message_raw["datetime"] = iso


@pytest.fixture(autouse=True)
def start_clock(direct_vm):
    _warp(direct_vm, 2_000_000_000)


def _create_coverage(vm, contract, provider, beneficiary, *, minimum=300, tolerance=60,
                     payout=PAYOUT, max_claims=2, coverage_secs=3600):
    global START, END
    vm.sender = provider
    vm.value = payout * max_claims
    try:
        coverage_id = contract.create_coverage(
            "Example API", "test-coverage-ref-0001", "https://api.example.com",
            "https://status.example.com", "eu-west",
            _address(beneficiary), minimum, tolerance, payout, max_claims, coverage_secs,
        )
    finally:
        vm.value = 0
    created = int(contract.get_coverage(coverage_id)["created_at_unix"])
    START = created + 120
    END = created + 420
    _warp(vm, END + 30)
    return coverage_id


def _submit(vm, contract, coverage_id, beneficiary, *, start=None, end=None,
            operator_url=OPERATOR_URL, monitor_url=MONITOR_URL):
    vm.sender = beneficiary
    start = START if start is None else start
    end = END if end is None else end
    return contract.submit_claim(coverage_id, start, end, operator_url, monitor_url)


def _mock_sources(vm, operator_secs, monitor_secs, *, operator_outage=True,
                  monitor_outage=True, operator_status=200, monitor_status=200):
    vm.clear_mocks()
    vm.mock_web(r".*status\.example\.com/incidents/42.*",
                {"status": operator_status, "body": "operator incident report"})
    vm.mock_web(r".*monitor\.example\.net/history/42.*",
                {"status": monitor_status, "body": "independent monitor report"})
    vm.mock_llm("SOURCE ROLE: service operator", json.dumps({
        "outage_confirmed": operator_outage,
        "service_match": True,
        "region_match": True,
        "start_unix": START,
        "end_unix": START + operator_secs,
        "confidence": 90,
    }))
    vm.mock_llm("SOURCE ROLE: independent monitor", json.dumps({
        "outage_confirmed": monitor_outage,
        "service_match": True,
        "region_match": True,
        "start_unix": START,
        "end_unix": START + monitor_secs,
        "confidence": 90,
    }))


def test_only_named_beneficiary_can_submit_and_daily_claim_is_unique(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = direct_deploy("contracts/outage_bond.py")
    coverage_id = _create_coverage(direct_vm, contract, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with pytest.raises(Exception, match="named beneficiary"):
        _submit(direct_vm, contract, coverage_id, direct_charlie)

    claim_id = _submit(direct_vm, contract, coverage_id, direct_bob)
    coverage = contract.get_coverage(coverage_id)
    assert claim_id == "obc-1"
    assert coverage["pending_claims"] == "1"
    assert coverage["available_atto"] == str(PAYOUT)
    assert coverage["reserved_atto"] == str(PAYOUT)
    with pytest.raises(Exception, match="already has a claim"):
        _submit(direct_vm, contract, coverage_id, direct_bob, start=START + 10, end=END - 10)


def test_two_sources_agree_on_qualifying_outage_and_only_claimant_can_collect(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = direct_deploy("contracts/outage_bond.py")
    coverage_id = _create_coverage(direct_vm, contract, direct_alice, direct_bob)
    claim_id = _submit(direct_vm, contract, coverage_id, direct_bob)
    _warp(direct_vm, END + 30)
    _mock_sources(direct_vm, 320, 325)

    direct_vm.sender = direct_charlie
    contract.attest(claim_id)
    claim = contract.get_claim(claim_id)
    assert claim["status"] == "ELIGIBLE"
    assert claim["attestation"]["operator"]["source_verdict"] == "OUTAGE_QUALIFIES"
    assert claim["attestation"]["monitor"]["source_verdict"] == "OUTAGE_QUALIFIES"
    assert claim["attestation"]["intervals_agree"] is True

    with pytest.raises(Exception, match="submitting claimant"):
        contract.claim_payout(claim_id)
    direct_vm.sender = direct_bob
    contract.claim_payout(claim_id)
    assert contract.get_claim(claim_id)["status"] == "PAID"
    assert contract.get_coverage(coverage_id)["reserved_atto"] == "0"


def test_near_threshold_readings_within_time_tolerance_do_not_disagree_on_payout(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = direct_deploy("contracts/outage_bond.py")
    coverage_id = _create_coverage(
        direct_vm, contract, direct_alice, direct_bob, minimum=300, tolerance=60,
        max_claims=1,
    )
    claim_id = _submit(direct_vm, contract, coverage_id, direct_bob)
    _warp(direct_vm, END + 30)
    _mock_sources(direct_vm, 298, 302)

    direct_vm.sender = direct_charlie
    contract.attest(claim_id)
    first = contract.get_claim(claim_id)
    assert first["status"] == "PENDING"
    assert first["attestation"]["operator"]["source_verdict"] == "OUTAGE_TOO_SHORT"
    assert first["attestation"]["monitor"]["source_verdict"] == "OUTAGE_QUALIFIES"
    assert first["attestation"]["outcome"] == "UNVERIFIABLE"
    assert first["attestation_attempts"] == "1"
    assert contract.get_coverage(coverage_id)["reserved_atto"] == str(PAYOUT)

    for attempt in (2, 3):
        _warp(direct_vm, END + 30 + 60 * (attempt - 1))
        contract.attest(claim_id)
    final_claim = contract.get_claim(claim_id)
    coverage = contract.get_coverage(coverage_id)
    assert final_claim["status"] == "UNVERIFIABLE"
    assert final_claim["attestation_attempts"] == "3"
    assert coverage["pending_claims"] == "0"
    assert coverage["reserved_atto"] == "0"
    assert coverage["available_atto"] == str(PAYOUT)


def test_sources_from_same_host_and_mismatched_outage_signals_are_rejected_or_unverifiable(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/outage_bond.py")
    coverage_id = _create_coverage(direct_vm, contract, direct_alice, direct_bob)
    with pytest.raises(Exception, match="different public hosts"):
        _submit(
            direct_vm, contract, coverage_id, direct_bob,
            monitor_url="https://status.example.com/monitor/42",
        )

    claim_id = _submit(direct_vm, contract, coverage_id, direct_bob)
    _warp(direct_vm, END + 30)
    _mock_sources(direct_vm, 330, 330, monitor_outage=False)
    contract.attest(claim_id)
    claim = contract.get_claim(claim_id)
    assert claim["status"] == "PENDING"
    assert claim["attestation"]["outcome"] == "UNVERIFIABLE"
