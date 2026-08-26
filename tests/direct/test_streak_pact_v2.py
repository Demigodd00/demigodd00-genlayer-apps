import hashlib
import json
from datetime import datetime, timezone

import pytest

STAKE = 10**18
DAY = 86400
APPEAL_WINDOW = 3600
EVIDENCE_BODY = b'{"activity":"strength workout","duration_minutes":55,"completed":true}'
EVIDENCE_DIGEST = hashlib.sha256(EVIDENCE_BODY).hexdigest()
EVIDENCE_URL = "https://arweave.net/audit-fixture-1"
TEST_NOW_UNIX = 2_000_000_000


def _warp_to(direct_vm, unix_ts: int) -> None:
    direct_vm.warp(datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat())


def _deploy(direct_deploy, owner):
    return direct_deploy(
        "contracts/streak_pact_v2.py",
        "0x" + owner.hex(),
        0,
        DAY,
        APPEAL_WINDOW,
    )


def _start() -> int:
    return TEST_NOW_UNIX + 120


def _create(
    direct_vm,
    contract,
    maker,
    failure_recipient,
    *,
    mode="SELF",
    periods=3,
    misses=1,
    start=None,
):
    direct_vm.sender = maker
    direct_vm.value = STAKE
    pact_id = contract.create_pact(
        mode,
        "Three-day strength streak",
        "Complete at least one documented 30 minute strength workout in the period.",
        periods,
        misses,
        start if start is not None else _start(),
        "0x" + failure_recipient.hex(),
    )
    direct_vm.value = 0
    return pact_id


def _join(direct_vm, contract, taker, pact_id):
    direct_vm.sender = taker
    direct_vm.value = STAKE
    contract.join_pact(pact_id)
    direct_vm.value = 0


def _mock_evidence(direct_vm, verdict="KEPT", confidence=90):
    direct_vm.mock_web(
        r"https://arweave\.net/.*",
        {"status": 200, "body": EVIDENCE_BODY.decode("utf-8")},
    )
    direct_vm.mock_llm(
        r".*accountability escrow jury.*",
        json.dumps(
            {
                "verdict": verdict,
                "confidence": confidence,
                "reason": "The immutable activity record satisfies the stated criteria.",
            }
        ),
    )


def test_self_pact_is_live_and_indexed(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_deploy, direct_bob)
    pact_id = _create(direct_vm, contract, direct_alice, direct_bob)

    pact = contract.get_pact(pact_id)
    mine = contract.list_user_pacts(pact["maker"], 0, 25)
    assert pact["mode"] == "SELF"
    assert pact["status"] == "LIVE"
    assert pact["taker"] == ""
    assert pact["window_open_now"] is False
    assert mine["total"] == "1"
    assert mine["items"][0]["id"] == pact_id


def test_self_pact_rejects_maker_as_failure_recipient(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    with pytest.raises(Exception, match="failure recipient must differ"):
        _create(direct_vm, contract, direct_alice, direct_alice)
    direct_vm.value = 0


def test_challenge_must_join_before_start(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy, direct_charlie)
    start = _start()
    pact_id = _create(
        direct_vm,
        contract,
        direct_alice,
        direct_charlie,
        mode="CHALLENGE",
        start=start,
    )
    _warp_to(direct_vm, start)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="already started"):
        contract.join_pact(pact_id)
    direct_vm.value = 0


def test_unjoined_challenge_can_be_cancelled_after_start(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    start = _start()
    pact_id = _create(
        direct_vm,
        contract,
        direct_alice,
        direct_bob,
        mode="CHALLENGE",
        start=start,
    )
    _warp_to(direct_vm, start + DAY)
    direct_vm.sender = direct_alice
    contract.cancel_before_start(pact_id)

    assert contract.get_pact(pact_id)["status"] == "VOIDED"


def test_zero_checkins_can_never_win(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    start = _start()
    pact_id = _create(
        direct_vm,
        contract,
        direct_alice,
        direct_bob,
        periods=3,
        misses=1,
        start=start,
    )
    _warp_to(direct_vm, start + 3 * DAY + 1)
    direct_vm.sender = direct_alice
    contract.propose_settlement(pact_id)

    pact = contract.get_pact(pact_id)
    assert pact["status"] == "PROVISIONAL_LOST"
    assert pact["miss_count"] == "3"
    assert contract.list_checkins(pact_id, 0, 25)["total"] == "3"


def test_checkin_catches_up_expired_periods_in_one_transaction(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    start = _start()
    pact_id = _create(
        direct_vm,
        contract,
        direct_alice,
        direct_bob,
        periods=3,
        misses=1,
        start=start,
    )
    _mock_evidence(direct_vm)
    _warp_to(direct_vm, start + DAY + 60)
    direct_vm.sender = direct_alice
    contract.submit_checkin(
        pact_id,
        EVIDENCE_URL,
        EVIDENCE_DIGEST,
        "Second period evidence after missing the first period.",
    )

    pact = contract.get_pact(pact_id)
    first = contract.get_checkin(pact_id, 0)
    second = contract.get_checkin(pact_id, 1)
    assert pact["miss_count"] == "1"
    assert pact["kept_count"] == "1"
    assert first["method"] == "AUTO_MISS"
    assert second["verdict"] == "KEPT"


def test_digest_is_required_and_verified(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    start = _start()
    pact_id = _create(direct_vm, contract, direct_alice, direct_bob, start=start)
    _mock_evidence(direct_vm)
    _warp_to(direct_vm, start + 60)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="digest mismatch"):
        contract.submit_checkin(pact_id, EVIDENCE_URL, "0" * 64, "Valid-looking note")


def test_arbitrary_web_evidence_is_rejected(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    start = _start()
    pact_id = _create(direct_vm, contract, direct_alice, direct_bob, start=start)
    _warp_to(direct_vm, start + 60)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="approved IPFS or Arweave"):
        contract.submit_checkin(
            pact_id,
            "https://example.com/mutable-page",
            EVIDENCE_DIGEST,
            "This source is not content-addressed.",
        )


def test_low_confidence_does_not_record_a_financial_verdict(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    start = _start()
    pact_id = _create(direct_vm, contract, direct_alice, direct_bob, start=start)
    _mock_evidence(direct_vm, verdict="KEPT", confidence=40)
    _warp_to(direct_vm, start + 60)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="inconclusive"):
        contract.submit_checkin(pact_id, EVIDENCE_URL, EVIDENCE_DIGEST, "Weak evidence")
    assert contract.get_pact(pact_id)["kept_count"] == "0"


def test_claim_is_locked_until_appeal_window_closes(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    start = _start()
    pact_id = _create(
        direct_vm,
        contract,
        direct_alice,
        direct_bob,
        periods=3,
        misses=1,
        start=start,
    )
    _warp_to(direct_vm, start + 3 * DAY + 1)
    direct_vm.sender = direct_alice
    contract.propose_settlement(pact_id)
    with pytest.raises(Exception, match="not finalized"):
        contract.claim(pact_id)
    with pytest.raises(Exception, match="appeal window is still open"):
        contract.finalize_settlement(pact_id)

    _warp_to(direct_vm, start + 3 * DAY + APPEAL_WINDOW + 2)
    contract.finalize_settlement(pact_id)
    assert contract.get_pact(pact_id)["status"] == "LOST"


def test_only_adversely_affected_participant_can_appeal(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy, direct_charlie)
    start = _start()
    pact_id = _create(
        direct_vm,
        contract,
        direct_alice,
        direct_charlie,
        mode="CHALLENGE",
        periods=3,
        misses=0,
        start=start,
    )
    _join(direct_vm, contract, direct_bob, pact_id)
    _warp_to(direct_vm, start + 3 * DAY + 1)
    direct_vm.sender = direct_charlie
    contract.propose_settlement(pact_id)

    _mock_evidence(direct_vm, verdict="KEPT", confidence=90)
    direct_vm.sender = direct_charlie
    with pytest.raises(Exception, match="only the maker can appeal"):
        contract.appeal_period(
            pact_id,
            0,
            "I am an unrelated account attempting to interfere.",
            EVIDENCE_URL,
            EVIDENCE_DIGEST,
        )


def test_successful_appeal_reconciles_aggregate_verdict_stats(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    start = _start()
    pact_id = _create(
        direct_vm,
        contract,
        direct_alice,
        direct_bob,
        periods=3,
        misses=1,
        start=start,
    )
    _warp_to(direct_vm, start + 3 * DAY + 1)
    direct_vm.sender = direct_alice
    contract.propose_settlement(pact_id)
    _mock_evidence(direct_vm, verdict="KEPT", confidence=90)
    contract.appeal_period(
        pact_id,
        0,
        "This immutable record proves the first period was completed.",
        EVIDENCE_URL,
        EVIDENCE_DIGEST,
    )

    pact = contract.get_pact(pact_id)
    stats = contract.get_stats()
    assert pact["status"] == "PROVISIONAL_LOST"
    assert pact["kept_count"] == "1"
    assert pact["miss_count"] == "2"
    assert stats["total_kept"] == "1"
    assert stats["total_missed"] == "2"


def test_page_size_is_capped(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_deploy, direct_bob)
    _create(direct_vm, contract, direct_alice, direct_bob)
    result = contract.list_pacts(0, 10_000)
    assert result["total"] == "1"
    assert len(result["items"]) == 1
    assert contract.get_config()["max_page_size"] == "25"
