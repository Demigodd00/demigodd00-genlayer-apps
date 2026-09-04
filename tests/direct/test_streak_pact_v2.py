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
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


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
    attestor=None,
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
        "0x" + (attestor if attestor is not None else maker).hex(),
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
    assert pact["evidence_attestor"].lower() == pact["maker"].lower()
    assert pact["provenance_policy"] == "SELF_ATTESTED"
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


def test_zero_treasury_is_rejected(direct_deploy):
    with pytest.raises(Exception, match="treasury cannot be the zero address"):
        direct_deploy(
            "contracts/streak_pact_v2.py",
            ZERO_ADDRESS,
            0,
            DAY,
            APPEAL_WINDOW,
        )


def test_zero_creation_addresses_are_rejected(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    base_args = (
        "SELF",
        "Three-day strength streak",
        "Complete at least one documented 30 minute strength workout in the period.",
        3,
        1,
        _start(),
    )
    with pytest.raises(Exception, match="failure recipient cannot be the zero address"):
        contract.create_pact(*base_args, ZERO_ADDRESS, "0x" + direct_alice.hex())
    with pytest.raises(Exception, match="evidence attestor cannot be the zero address"):
        contract.create_pact(*base_args, "0x" + direct_bob.hex(), ZERO_ADDRESS)
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
        "I attest that the second-period strength workout was completed.",
        start + DAY + 30,
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
        contract.submit_checkin(
            pact_id,
            EVIDENCE_URL,
            "0" * 64,
            "I attest that this period's strength workout was completed.",
            start + 30,
        )


def test_validator_receives_the_complete_evidence_document(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    start = _start()
    pact_id = _create(direct_vm, contract, direct_alice, direct_bob, start=start)
    marker = "FULL_DOCUMENT_TAIL"
    page = ("é" * (8_000 - len(marker))) + marker
    body = page.encode("utf-8")
    digest = hashlib.sha256(body).hexdigest()
    direct_vm.mock_web(
        r"https://arweave\.net/.*",
        {"status": 200, "body": page},
    )
    direct_vm.mock_llm(
        r"(?s).*FULL_DOCUMENT_TAIL.*",
        json.dumps({
            "verdict": "KEPT",
            "confidence": 90,
            "reason": "The full document, including its tail, was evaluated.",
        }),
    )
    _warp_to(direct_vm, start + 60)
    direct_vm.sender = direct_alice
    contract.submit_checkin(
        pact_id,
        EVIDENCE_URL,
        digest,
        "I attest that the complete evidence document proves this workout.",
        start + 30,
    )
    assert contract.get_checkin(pact_id, 0)["verdict"] == "KEPT"


def test_evidence_over_the_character_limit_is_rejected_instead_of_truncated(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    start = _start()
    pact_id = _create(direct_vm, contract, direct_alice, direct_bob, start=start)
    page = "x" * 8_001
    digest = hashlib.sha256(page.encode("utf-8")).hexdigest()
    direct_vm.mock_web(
        r"https://arweave\.net/.*",
        {"status": 200, "body": page},
    )
    _warp_to(direct_vm, start + 60)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="8000 character limit"):
        contract.submit_checkin(
            pact_id,
            EVIDENCE_URL,
            digest,
            "I attest that this oversized document proves the workout.",
            start + 30,
        )


def test_configured_verifier_wallet_authenticates_the_exact_claim(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy, direct_charlie)
    start = _start()
    pact_id = _create(
        direct_vm,
        contract,
        direct_alice,
        direct_charlie,
        start=start,
        attestor=direct_bob,
    )
    _mock_evidence(direct_vm)
    _warp_to(direct_vm, start + 60)
    args = (
        pact_id,
        EVIDENCE_URL,
        EVIDENCE_DIGEST,
        "I independently attest that the subject completed this period's workout.",
        start + 30,
    )

    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="configured evidence attestor"):
        contract.submit_checkin(*args)

    direct_vm.sender = direct_bob
    contract.submit_checkin(*args)
    pact = contract.get_pact(pact_id)
    checkin = contract.get_checkin(pact_id, 0)
    original = checkin["original_record"]
    assert pact["provenance_policy"] == "WALLET_VERIFIED"
    assert pact["evidence_attestor"].lower() == ("0x" + direct_bob.hex()).lower()
    assert checkin["subject"].lower() == ("0x" + direct_alice.hex()).lower()
    assert original["attestor"].lower() == ("0x" + direct_bob.hex()).lower()
    assert original["provenance"] == "WALLET_VERIFIED"
    assert original["content_digest"] == EVIDENCE_DIGEST
    assert len(original["attestation_id"]) == 64
    assert checkin["attestation_id"] == original["attestation_id"]


def test_observed_time_must_belong_to_the_judged_period(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_bob)
    start = _start()
    pact_id = _create(direct_vm, contract, direct_alice, direct_bob, start=start)
    _mock_evidence(direct_vm)
    _warp_to(direct_vm, start + 60)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="observed time must be inside"):
        contract.submit_checkin(
            pact_id,
            EVIDENCE_URL,
            EVIDENCE_DIGEST,
            "I attest that this period's strength workout was completed.",
            start - 1,
        )


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
            "I attest that this source documents the completed workout.",
            start + 30,
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
        contract.submit_checkin(
            pact_id,
            EVIDENCE_URL,
            EVIDENCE_DIGEST,
            "I attest that this period's strength workout was completed.",
            start + 30,
        )
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
            start + 30,
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
        start + 30,
    )

    pact = contract.get_pact(pact_id)
    stats = contract.get_stats()
    assert pact["status"] == "PROVISIONAL_LOST"
    assert pact["kept_count"] == "1"
    assert pact["miss_count"] == "2"
    assert stats["total_kept"] == "1"
    assert stats["total_missed"] == "2"
    checkin = contract.get_checkin(pact_id, 0)
    assert checkin["verdict"] == "KEPT"
    assert checkin["method"] == "SIGNED_APPEAL_EVIDENCE"
    assert checkin["original_record"]["verdict"] == "MISSED"
    assert checkin["original_record"]["method"] == "AUTO_MISS"
    assert checkin["original_record"]["content_digest"] == ""
    assert checkin["appeal_record"]["verdict"] == "KEPT"
    assert checkin["appeal_record"]["content_digest"] == EVIDENCE_DIGEST
    assert checkin["appeal_record"]["attestor"].lower() == pact["maker"].lower()
    assert len(checkin["appeal_record"]["attestation_id"]) == 64


def test_page_size_is_capped(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_deploy, direct_bob)
    _create(direct_vm, contract, direct_alice, direct_bob)
    result = contract.list_pacts(0, 10_000)
    assert result["total"] == "1"
    assert len(result["items"]) == 1
    config = contract.get_config()
    assert config["max_page_size"] == "25"
    assert config["version"] == "2.2.0"
    assert config["max_evidence_bytes"] == "100000"
    assert config["max_evidence_chars"] == "8000"
    assert config["evidence_policy"] == "CONTENT_ADDRESSED_AND_WALLET_ATTESTED"
    assert config["original_appeal_records"] == "IMMUTABLE_SEPARATE_RECORDS"
