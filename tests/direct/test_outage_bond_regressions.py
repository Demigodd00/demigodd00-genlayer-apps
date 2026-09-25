"""Adversarial settlement and independent-validator regressions for OutageBond."""
import copy
import json

import pytest
import test_outage_bond as t


def test_negative_extracted_timestamps_become_unverifiable(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy("contracts/outage_bond.py")
    cov = t._create_coverage(direct_vm, c, direct_alice, direct_bob)
    cid = t._submit(direct_vm, c, cov, direct_bob)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "ambiguous incident report"})
    direct_vm.mock_llm(r".*", json.dumps({"outage_confirmed": True, "service_match": True,
        "region_match": True, "start_unix": -1, "end_unix": 1, "confidence": 90}))
    c.attest(cid)
    assert direct_vm.run_validator() is True
    assert c.get_claim(cid)["attestation"]["outcome"] == "UNVERIFIABLE"
    assert c.get_claim(cid)["attestation_attempts"] == "1"


def test_paid_claim_preserves_remaining_capacity(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy("contracts/outage_bond.py")
    cov = t._create_coverage(direct_vm, c, direct_alice, direct_bob, coverage_secs=3*86400)
    cid = t._submit(direct_vm, c, cov, direct_bob)
    t._mock_sources(direct_vm, 320, 320)
    c.attest(cid)
    assert direct_vm.run_validator() is True
    c.claim_payout(cid)
    state = c.get_coverage(cov)
    assert state["eligible_claims"] == "0"
    assert state["paid_claims"] == "1"
    assert state["available_atto"] == str(t.PAYOUT)
    assert state["can_submit"] is True
    t._warp(direct_vm, t.END+86400+30)
    second = t._submit(direct_vm, c, cov, direct_bob, start=t.START+86400, end=t.END+86400)
    assert c.get_claim(second)["status"] == "PENDING"


def test_reported_outage_must_be_inside_coverage(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy("contracts/outage_bond.py")
    cov = t._create_coverage(direct_vm, c, direct_alice, direct_bob, minimum=300, tolerance=300)
    created = int(c.get_coverage(cov)["created_at_unix"])
    cid = t._submit(direct_vm, c, cov, direct_bob, start=created+1, end=created+301)
    t.START = created-240
    t._mock_sources(direct_vm, 300, 300)
    c.attest(cid)
    assert direct_vm.run_validator() is True
    assert c.get_claim(cid)["status"] == "INELIGIBLE"
    assert c.get_claim(cid)["attestation"]["operator"]["source_verdict"] == "OUTSIDE_COVERAGE"
    assert c.get_coverage(cov)["reserved_atto"] == "0"


def test_same_cross_midnight_report_cannot_qualify_split_claims(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy("contracts/outage_bond.py")
    cov = t._create_coverage(direct_vm, c, direct_alice, direct_bob, minimum=300, tolerance=180, coverage_secs=3*86400)
    midnight = (int(c.get_coverage(cov)["created_at_unix"])//86400+2)*86400
    t._warp(direct_vm, midnight+210)
    first = t._submit(direct_vm, c, cov, direct_bob, start=midnight-180, end=midnight)
    second = t._submit(direct_vm, c, cov, direct_bob, start=midnight, end=midnight+180)
    t.START = midnight-180
    t._mock_sources(direct_vm, 360, 360)
    for cid in (first, second):
        c.attest(cid)
        assert direct_vm.run_validator() is True
        assert c.get_claim(cid)["attestation"]["outcome"] == "UNVERIFIABLE"
        with pytest.raises(Exception, match="eligible payout"):
            c.claim_payout(cid)
    assert c.get_stats()["total_paid_atto"] == "0"


def test_complete_cross_midnight_claim_reserves_both_days(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy("contracts/outage_bond.py")
    cov = t._create_coverage(direct_vm, c, direct_alice, direct_bob, coverage_secs=3*86400)
    midnight = (int(c.get_coverage(cov)["created_at_unix"])//86400+2)*86400
    t._warp(direct_vm, midnight+210)
    cid = t._submit(direct_vm, c, cov, direct_bob, start=midnight-180, end=midnight+180)
    assert c.get_claim_for_day(cov, midnight)["claim_id"] == cid
    assert c.get_claim_for_day(cov, midnight-86400)["claim_id"] == cid
    with pytest.raises(Exception, match="already has a claim"):
        t._submit(direct_vm, c, cov, direct_bob, start=midnight, end=midnight+180)
    t.START = midnight-180
    t._mock_sources(direct_vm, 360, 360)
    c.attest(cid)
    assert direct_vm.run_validator() is True
    assert c.get_claim(cid)["status"] == "ELIGIBLE"


def test_failed_consensus_expires_without_a_successful_attestation(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = direct_deploy("contracts/outage_bond.py")
    cov = t._create_coverage(direct_vm, c, direct_alice, direct_bob)
    cid = t._submit(direct_vm, c, cov, direct_bob)
    with pytest.raises(Exception, match="still open"):
        c.expire_claim(cid)
    for index in range(3):
        snap = direct_vm.snapshot()
        t._mock_sources(direct_vm, 320, 320)
        c.attest(cid)
        t._mock_sources(direct_vm, 280, 280)
        assert direct_vm.run_validator() is False
        direct_vm.revert(snap)
        t._warp(direct_vm, t.END+90*(index+1))
    claim = c.get_claim(cid)
    assert claim["attestation_attempts"] == "0"
    t._warp(direct_vm, int(claim["attestation_deadline_unix"]))
    assert c.get_claim(cid)["can_attest"] is False
    with pytest.raises(Exception, match="deadline passed"):
        c.attest(cid)
    direct_vm.sender = direct_charlie
    c.expire_claim(cid)
    assert c.get_claim(cid)["status"] == "UNVERIFIABLE"
    assert c.get_claim(cid)["attestation"] == {}
    assert c.get_coverage(cov)["reserved_atto"] == "0"
    assert c.get_coverage(cov)["pending_claims"] == "0"
    with pytest.raises(Exception, match="only pending"):
        c.expire_claim(cid)
    end = int(c.get_coverage(cov)["ends_at_unix"])
    t._warp(direct_vm, end+7*86400+1)
    direct_vm.sender = direct_alice
    c.close_coverage(cov)
    assert c.get_coverage(cov)["closed"] is True


@pytest.mark.parametrize("mutation", ["operator_url", "monitor_url", "reason", "threshold", "extra", "confidence", "outcome"])
def test_validator_rejects_noncanonical_leader_evidence(direct_vm, direct_deploy, direct_alice, direct_bob, mutation):
    c = direct_deploy("contracts/outage_bond.py")
    cov = t._create_coverage(direct_vm, c, direct_alice, direct_bob)
    cid = t._submit(direct_vm, c, cov, direct_bob)
    t._mock_sources(direct_vm, 320, 320)
    c.attest(cid)
    assert direct_vm.run_validator() is True
    forged = copy.deepcopy(c.get_claim(cid)["attestation"])
    if mutation.endswith("_url"):
        forged[mutation.split("_")[0]]["url"] = "https://unrelated.example/report"
    elif mutation == "threshold":
        for role in ("operator", "monitor"):
            forged[role]["end_unix"] = t.START+280
    elif mutation == "extra":
        forged["operator"]["invented_quote"] = "not evidence"
    elif mutation == "confidence":
        forged["operator"]["confidence_bucket"] = True
    elif mutation == "outcome":
        forged["outcome"] = "INELIGIBLE"
    else:
        forged["reason"] = "An invented explanation"
    assert direct_vm.run_validator(leader_result=forged) is False


def test_expired_payout_releases_eligible_slot(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy("contracts/outage_bond.py")
    cov = t._create_coverage(direct_vm, c, direct_alice, direct_bob, coverage_secs=30*86400)
    cid = t._submit(direct_vm, c, cov, direct_bob)
    t._mock_sources(direct_vm, 320, 320)
    c.attest(cid)
    deadline = int(c.get_claim(cid)["payout_expires_at_unix"])
    t._warp(direct_vm, deadline+1)
    c.expire_payout(cid)
    state = c.get_coverage(cov)
    assert state["eligible_claims"] == "0"
    assert state["reserved_atto"] == "0"
    assert state["available_atto"] == str(2*t.PAYOUT)
