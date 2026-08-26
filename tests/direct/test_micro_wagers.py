import json
from datetime import datetime, timezone

import pytest

STAKE = 10**18
APPEAL_WINDOW = 3 * 24 * 60 * 60
TEST_NOW_UNIX = 2_000_000_000


def _addr_hex(a) -> str:
    if hasattr(a, "as_bytes"):
        b = a.as_bytes
    elif isinstance(a, bytes):
        b = a
    else:
        b = bytes.fromhex(str(a).replace("0x", ""))
    return "0x" + b.hex()


def _deadline(seconds_ahead: int) -> int:
    return TEST_NOW_UNIX + seconds_ahead


def _warp_past(deadline_unix: int, direct_vm) -> None:
    target = datetime.fromtimestamp(deadline_unix + 5, tz=timezone.utc).isoformat()
    direct_vm.warp(target)


def _warp_past_appeal(contract, wager_id: str, direct_vm) -> None:
    resolved = int(contract.get_wager(wager_id)["resolved_at_unix"])
    target = datetime.fromtimestamp(resolved + APPEAL_WINDOW + 1, tz=timezone.utc).isoformat()
    direct_vm.warp(target)


def _mock_verdict(direct_vm, outcome: str, confidence: int = 80, reason: str = "evidence supports this") -> None:
    direct_vm.mock_llm(
        r".*impartial adjudicator.*",
        json.dumps({"outcome": outcome, "confidence": confidence, "reason": reason}),
    )


def _mock_source(direct_vm) -> None:
    direct_vm.mock_web(
        r".*example\.com/.*",
        {"status": 200, "body": "Team X won the grand final 3-1."},
    )


def _create(direct_vm, contract, creator, deadline=None, question="Will Team X win the grand final?"):
    direct_vm.sender = creator
    direct_vm.value = STAKE
    wid = contract.create_wager(
        question,
        "Team X wins",
        "Team X does not win",
        "https://example.com/results",
        deadline if deadline is not None else _deadline(120),
    )
    direct_vm.value = 0
    return wid


def test_create_wager_stores_terms(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/micro_wagers.py")
    wid = _create(direct_vm, contract, direct_alice)

    w = contract.get_wager(wid)
    assert w["status"] == "OPEN"
    assert w["stake_atto"] == str(STAKE)
    assert w["creator_side"] == "Team X wins"
    assert w["taker_side"] == "Team X does not win"
    assert len(w["question"]) > 0


def test_studionet_appeal_window_is_configurable(direct_deploy):
    contract = direct_deploy("contracts/micro_wagers.py", 0, 300)
    assert contract.get_stats()["appeal_window_secs"] == "300"


def test_rejects_appeal_window_below_contract_minimum(direct_deploy):
    with pytest.raises(Exception, match="appeal window must be"):
        direct_deploy("contracts/micro_wagers.py", 0, 299)


def test_create_rejects_zero_stake(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/micro_wagers.py")
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    with pytest.raises(Exception, match="stake must be greater than zero"):
        contract.create_wager("q", "a", "b", "", _deadline(120))


def test_create_rejects_identical_sides(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/micro_wagers.py")
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="sides must be different"):
        contract.create_wager("q", "same", "same", "", _deadline(120))
    direct_vm.value = 0


def test_create_rejects_near_deadline(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/micro_wagers.py")
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="deadline must be at least"):
        contract.create_wager("q", "a", "b", "", _deadline(10))
    direct_vm.value = 0


def test_accept_flow(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    wid = _create(direct_vm, contract, direct_alice)

    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="creator cannot accept"):
        contract.accept_wager(wid)

    direct_vm.sender = direct_bob
    direct_vm.value = STAKE // 2
    with pytest.raises(Exception, match="must stake exactly"):
        contract.accept_wager(wid)

    direct_vm.value = STAKE
    contract.accept_wager(wid)
    direct_vm.value = 0

    w = contract.get_wager(wid)
    assert w["status"] == "LIVE"
    assert w["taker"].lower() == _addr_hex(direct_bob).lower()

    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="not open for acceptance"):
        contract.accept_wager(wid)
    direct_vm.value = 0


def test_accept_after_deadline_is_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    deadline = _deadline(120)
    wid = _create(direct_vm, contract, direct_alice, deadline=deadline)
    _warp_past(deadline, direct_vm)

    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="deadline has passed"):
        contract.accept_wager(wid)
    direct_vm.value = 0
    assert contract.get_wager(wid)["status"] == "OPEN"


def test_cancel_open_wager_refunds_creator(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    wid = _create(direct_vm, contract, direct_alice)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="only the creator can cancel"):
        contract.cancel_wager(wid)

    direct_vm.sender = direct_alice
    contract.cancel_wager(wid)
    assert contract.get_wager(wid)["status"] == "VOIDED"


def test_resolve_requires_live_and_deadline(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    wid = _create(direct_vm, contract, direct_alice)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="not live"):
        contract.resolve_wager(wid)

    direct_vm.value = STAKE
    contract.accept_wager(wid)
    direct_vm.value = 0

    with pytest.raises(Exception, match="not yet decidable"):
        contract.resolve_wager(wid)

    _warp_past(_deadline(120), direct_vm)
    _mock_verdict(direct_vm, "A")
    _mock_source(direct_vm)
    contract.resolve_wager(wid)
    assert contract.get_wager(wid)["status"] == "PROVISIONAL"


def test_resolve_creator_wins(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    wid = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_wager(wid)
    direct_vm.value = 0

    _warp_past(_deadline(120), direct_vm)
    _mock_verdict(direct_vm, "A", confidence=75)
    _mock_source(direct_vm)
    contract.resolve_wager(wid)

    w = contract.get_wager(wid)
    assert w["status"] == "PROVISIONAL"
    assert w["winner"].lower() == _addr_hex(direct_alice).lower()
    assert w["outcome_label"] == "Team X wins"
    assert w["confidence_bucket"] == "70"
    assert "[APPEAL" not in w["verdict_reason"]


def test_resolve_taker_wins(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    wid = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_wager(wid)
    direct_vm.value = 0

    _warp_past(_deadline(120), direct_vm)
    _mock_verdict(direct_vm, "B", confidence=90)
    _mock_source(direct_vm)
    contract.resolve_wager(wid)

    w = contract.get_wager(wid)
    assert w["winner"].lower() == _addr_hex(direct_bob).lower()
    assert w["outcome_label"] == "Team X does not win"
    assert w["confidence_bucket"] == "90"


def test_resolve_void_refunds(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    wid = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_wager(wid)
    direct_vm.value = 0

    _warp_past(_deadline(120), direct_vm)
    _mock_verdict(direct_vm, "VOID")
    _mock_source(direct_vm)
    contract.resolve_wager(wid)

    assert contract.get_wager(wid)["status"] == "VOIDED"
    assert contract.get_wager(wid)["outcome_label"] == ""


def test_low_confidence_resolution_voids(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    deadline = _deadline(120)
    wid = _create(direct_vm, contract, direct_alice, deadline=deadline)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_wager(wid)
    direct_vm.value = 0

    _warp_past(deadline, direct_vm)
    _mock_verdict(direct_vm, "A", confidence=40)
    _mock_source(direct_vm)
    contract.resolve_wager(wid)

    wager = contract.get_wager(wid)
    assert wager["status"] == "VOIDED"
    assert wager["verdict_reason"].startswith("[LOW CONFIDENCE]")


def test_claim_only_winner_and_settles(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    wid = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_wager(wid)
    direct_vm.value = 0

    _warp_past(_deadline(120), direct_vm)
    _mock_verdict(direct_vm, "A")
    _mock_source(direct_vm)
    contract.resolve_wager(wid)

    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="appeal window is still open"):
        contract.claim(wid)

    _warp_past_appeal(contract, wid, direct_vm)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="only the winner can claim"):
        contract.claim(wid)

    direct_vm.sender = direct_alice
    contract.claim(wid)
    assert contract.get_wager(wid)["status"] == "SETTLED"

    with pytest.raises(Exception, match="nothing to claim"):
        contract.claim(wid)


def test_appeal_upheld_keeps_winner_adds_bonus(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    wid = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_wager(wid)
    direct_vm.value = 0

    _warp_past(_deadline(120), direct_vm)
    _mock_verdict(direct_vm, "A", confidence=70)
    _mock_source(direct_vm)
    contract.resolve_wager(wid)

    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.appeal_wager(wid, "The source page was cached; the result was actually a draw.")
    direct_vm.value = 0

    w = contract.get_wager(wid)
    assert w["appealed"] == True
    assert w["winner"].lower() == _addr_hex(direct_alice).lower()
    assert w["pot_bonus_atto"] == str(STAKE)
    assert w["verdict_reason"].startswith("[APPEAL UPHELD]")


def test_appeal_overturned_flips_winner(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    wid = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_wager(wid)
    direct_vm.value = 0

    _warp_past(_deadline(120), direct_vm)
    _mock_verdict(direct_vm, "A")
    _mock_source(direct_vm)
    contract.resolve_wager(wid)

    direct_vm.clear_mocks()
    _mock_verdict(direct_vm, "B", confidence=85)
    _mock_source(direct_vm)

    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.appeal_wager(wid, "Official federation records show Team X lost.")
    direct_vm.value = 0

    w = contract.get_wager(wid)
    assert w["winner"].lower() == _addr_hex(direct_bob).lower()
    assert w["verdict_reason"].startswith("[OVERTURNED ON APPEAL]")
    assert w["pot_bonus_atto"] == "0"

    _warp_past_appeal(contract, wid, direct_vm)
    direct_vm.sender = direct_bob
    contract.claim(wid)
    assert contract.get_wager(wid)["status"] == "SETTLED"


def test_appeal_guards(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    wid = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_wager(wid)
    direct_vm.value = 0

    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="only provisional wagers"):
        contract.appeal_wager(wid, "too early")
    direct_vm.value = 0

    _warp_past(_deadline(120), direct_vm)
    _mock_verdict(direct_vm, "A")
    _mock_source(direct_vm)
    contract.resolve_wager(wid)

    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="only the losing participant"):
        contract.appeal_wager(wid, "i won though")
    direct_vm.value = 0

    direct_vm.sender = direct_bob
    direct_vm.value = STAKE // 2
    with pytest.raises(Exception, match="appeal bond must equal the stake"):
        contract.appeal_wager(wid, "dispute!")
    direct_vm.value = 0

    direct_vm.value = STAKE
    contract.appeal_wager(wid, "dispute!")
    direct_vm.value = 0

    direct_vm.value = STAKE
    with pytest.raises(Exception, match="appeal right already used"):
        contract.appeal_wager(wid, "again")
    direct_vm.value = 0


def test_third_party_cannot_appeal(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = direct_deploy("contracts/micro_wagers.py")
    deadline = _deadline(120)
    wid = _create(direct_vm, contract, direct_alice, deadline=deadline)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_wager(wid)
    direct_vm.value = 0

    _warp_past(deadline, direct_vm)
    _mock_verdict(direct_vm, "A")
    _mock_source(direct_vm)
    contract.resolve_wager(wid)

    direct_vm.sender = direct_charlie
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="only the losing participant"):
        contract.appeal_wager(wid, "An unrelated account must not be able to interfere.")
    direct_vm.value = 0


def test_list_and_stats_views(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/micro_wagers.py")
    _create(direct_vm, contract, direct_alice, question="Will it rain during the final?")
    _create(direct_vm, contract, direct_alice, question="Will the underdog score first?")

    listing = contract.list_wagers(0, 10)
    assert listing["total"] == "2"
    assert len(listing["items"]) == 2
    assert listing["items"][0]["status"] == "OPEN"

    stats = contract.get_stats()
    assert stats["total_created"] == "2"
    assert stats["total_settled"] == "0"


