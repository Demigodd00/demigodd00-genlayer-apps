import json
import time
from datetime import datetime, timezone

import pytest

STAKE = 10**18
DAY = 86400


def _start(seconds_ahead: int = 120) -> int:
    return int(time.time()) + seconds_ahead


def _warp_to(direct_vm, unix_ts: int) -> None:
    direct_vm.warp(datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat())


def _mock_gym_page(direct_vm) -> None:
    direct_vm.mock_web(
        r".*example\.com/gym.*",
        {"status": 200, "body": "Workout log: bench press 5x5, squats 3x5, completed 07:00."},
    )


def _mock_verdict(direct_vm, verdict: str, reason: str = "evidence shows the activity") -> None:
    direct_vm.mock_llm(
        r".*staked streak pact.*",
        json.dumps({"verdict": verdict, "confidence": 85, "reason": reason}),
    )


def _create(direct_vm, contract, maker, periods=3, misses=1, start=None, commitment="Go to the gym and complete a strength workout"):
    direct_vm.sender = maker
    direct_vm.value = STAKE
    pid = contract.create_pact(commitment, periods, misses, start if start is not None else _start(120))
    direct_vm.value = 0
    return pid


def _join(direct_vm, contract, joiner, pid):
    direct_vm.sender = joiner
    direct_vm.value = STAKE
    contract.join_pact(pid)
    direct_vm.value = 0


def _checkin(direct_vm, contract, maker, pid, day, url="https://example.com/gym/day", note=""):
    _warp_to(direct_vm, _window_start_of(contract, pid, day) + 3600)
    direct_vm.sender = maker
    contract.check_in(pid, note, f"{url}{day}" if url else "")


def _window_start_of(contract, pid, day) -> int:
    p = contract.get_pact(pid)
    return int(p["start_unix"]) + day * DAY


def test_create_pact_stores_terms(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(direct_vm, contract, direct_alice)

    p = contract.get_pact(pid)
    assert p["status"] == "OPEN"
    assert p["stake_atto"] == str(STAKE)
    assert p["pot_atto"] == str(STAKE * 2)
    assert p["periods_total"] == "3"
    assert p["allowed_misses"] == "1"
    assert p["kept_count"] == "0"
    assert p["miss_count"] == "0"
    assert len(p["commitment"]) > 0


def test_create_rejects_zero_stake(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/streak_pact.py")
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    with pytest.raises(Exception, match="stake must be greater than zero"):
        contract.create_pact("gym daily", 3, 1, _start(120))


def test_create_rejects_bad_period_count(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/streak_pact.py")
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="periods must be between"):
        contract.create_pact("gym daily", 2, 0, _start(120))
    with pytest.raises(Exception, match="periods must be between"):
        contract.create_pact("gym daily", 91, 0, _start(120))
    direct_vm.value = 0


def test_create_rejects_excessive_allowed_misses(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/streak_pact.py")
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="at most one third"):
        contract.create_pact("gym daily", 3, 2, _start(120))
    direct_vm.value = 0


def test_create_rejects_near_start(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/streak_pact.py")
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="start must be at least"):
        contract.create_pact("gym daily", 3, 1, _start(10))
    direct_vm.value = 0


def test_join_flow_and_guards(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(direct_vm, contract, direct_alice)

    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="maker cannot join own pact"):
        contract.join_pact(pid)

    direct_vm.sender = direct_bob
    direct_vm.value = STAKE // 2
    with pytest.raises(Exception, match="must stake exactly"):
        contract.join_pact(pid)

    direct_vm.value = STAKE
    contract.join_pact(pid)
    direct_vm.value = 0

    p = contract.get_pact(pid)
    assert p["status"] == "LIVE"

    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="not open for joining"):
        contract.join_pact(pid)
    direct_vm.value = 0


def test_join_after_start_fails(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    start = _start(120)
    pid = _create(direct_vm, contract, direct_alice, start=start)

    _warp_to(direct_vm, start + 5)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    with pytest.raises(Exception, match="already started"):
        contract.join_pact(pid)
    direct_vm.value = 0


def test_cancel_open_refunds_maker(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(direct_vm, contract, direct_alice)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="only the maker can cancel"):
        contract.cancel_pact(pid)

    direct_vm.sender = direct_alice
    contract.cancel_pact(pid)
    assert contract.get_pact(pid)["status"] == "VOIDED"


def test_check_in_guards(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(direct_vm, contract, direct_alice)

    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="pact is not live"):
        contract.check_in(pid, "", "https://example.com/gym/day0")

    _join(direct_vm, contract, direct_bob, pid)
    _mock_gym_page(direct_vm)
    _mock_verdict(direct_vm, "KEPT")

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="only the maker can check in"):
        contract.check_in(pid, "", "https://example.com/gym/day0")


def test_check_in_requires_evidence(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(direct_vm, contract, direct_alice)
    _join(direct_vm, contract, direct_bob, pid)

    direct_vm.sender = direct_alice
    _warp_to(direct_vm, _window_start_of(contract, pid, 0) + 3600)
    with pytest.raises(Exception, match="evidence required"):
        contract.check_in(pid, "too short", "")
    with pytest.raises(Exception, match="evidence required"):
        contract.check_in(pid, "", "")


def test_check_in_kept_with_evidence_snapshots_digest(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(direct_vm, contract, direct_alice)
    _join(direct_vm, contract, direct_bob, pid)
    _mock_gym_page(direct_vm)
    _mock_verdict(direct_vm, "KEPT")

    _checkin(direct_vm, contract, direct_alice, pid, 0)

    p = contract.get_pact(pid)
    assert p["kept_count"] == "1"
    assert p["miss_count"] == "0"

    c = contract.get_checkin(pid, 0)
    assert c["verdict"] == "KEPT"
    assert c["method"] == "EVIDENCE"
    assert len(c["content_digest"]) == 64
    assert c["evidence_url"].endswith("day0")


def test_check_in_note_only_path(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(
        direct_vm,
        contract,
        direct_alice,
        commitment="Write at least 300 words of your novel every day",
    )
    _join(direct_vm, contract, direct_bob, pid)
    _mock_verdict(direct_vm, "KEPT")

    _warp_to(direct_vm, _window_start_of(contract, pid, 0) + 3600)
    direct_vm.sender = direct_alice
    contract.check_in(
        pid,
        "Chapter three draft: she finally opened the lighthouse door and saw the sea.",
        "",
    )

    c = contract.get_checkin(pid, 0)
    assert c["verdict"] == "KEPT"
    assert c["method"] == "NOTE"


def test_check_in_missed_verdict_records_miss(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(direct_vm, contract, direct_alice)
    _join(direct_vm, contract, direct_bob, pid)
    _mock_gym_page(direct_vm)
    _mock_verdict(direct_vm, "MISSED")

    _checkin(direct_vm, contract, direct_alice, pid, 0)

    p = contract.get_pact(pid)
    assert p["kept_count"] == "0"
    assert p["miss_count"] == "1"
    assert contract.get_checkin(pid, 0)["verdict"] == "MISSED"


def test_check_in_outside_window_fails(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    start = _start(120)
    pid = _create(direct_vm, contract, direct_alice, start=start)
    _join(direct_vm, contract, direct_bob, pid)
    _mock_gym_page(direct_vm)
    _mock_verdict(direct_vm, "KEPT")

    _warp_to(direct_vm, start - 30)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="window for day 0 is not open yet"):
        contract.check_in(pid, "", "https://example.com/gym/day0")

    _warp_to(direct_vm, start + DAY + 60)
    with pytest.raises(Exception, match="window closed for day 0"):
        contract.check_in(pid, "", "https://example.com/gym/day0")


def test_malformed_llm_output_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(direct_vm, contract, direct_alice)
    _join(direct_vm, contract, direct_bob, pid)
    _mock_gym_page(direct_vm)
    direct_vm.mock_llm(r".*staked streak pact.*", "no json here at all")

    direct_vm.sender = direct_alice
    _warp_to(direct_vm, _window_start_of(contract, pid, 0) + 3600)
    with pytest.raises(Exception, match="no JSON object found"):
        contract.check_in(pid, "", "https://example.com/gym/day0")


def test_llm_alias_normalization(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(direct_vm, contract, direct_alice)
    _join(direct_vm, contract, direct_bob, pid)
    _mock_gym_page(direct_vm)
    direct_vm.clear_mocks()
    _mock_gym_page(direct_vm)
    direct_vm.mock_llm(
        r".*staked streak pact.*",
        'Sure! Here is the answer: {"verdict": "YES", "confidence": 55, "reason": "log confirms"}',
    )

    _checkin(direct_vm, contract, direct_alice, pid, 0)
    assert contract.get_checkin(pid, 0)["verdict"] == "KEPT"


def test_record_miss_only_after_window_closes(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    start = _start(120)
    pid = _create(direct_vm, contract, direct_alice, start=start)
    _join(direct_vm, contract, direct_bob, pid)

    direct_vm.sender = direct_bob
    _warp_to(direct_vm, start + 3600)
    with pytest.raises(Exception, match="still open"):
        contract.record_miss(pid)

    _warp_to(direct_vm, start + DAY + 60)
    contract.record_miss(pid)
    assert contract.get_pact(pid)["miss_count"] == "1"
    assert contract.get_checkin(pid, 0)["method"] == "AUTO_MISS"


def test_full_streak_wins_and_maker_claims(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(direct_vm, contract, direct_alice)
    _join(direct_vm, contract, direct_bob, pid)
    _mock_gym_page(direct_vm)
    _mock_verdict(direct_vm, "KEPT")

    for day in range(3):
        _checkin(direct_vm, contract, direct_alice, pid, day)

    direct_vm.sender = direct_bob
    contract.force_settle(pid)

    p = contract.get_pact(pid)
    assert p["status"] == "WON"
    assert p["kept_count"] == "3"
    assert p["miss_count"] == "0"

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="only the winner can claim"):
        contract.claim(pid)

    direct_vm.sender = direct_alice
    contract.claim(pid)
    assert contract.get_pact(pid)["status"] == "SETTLED"

    with pytest.raises(Exception, match="nothing to claim"):
        contract.claim(pid)


def test_exceeded_misses_forfeit_to_taker(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    start = _start(120)
    pid = _create(direct_vm, contract, direct_alice, start=start)
    _join(direct_vm, contract, direct_bob, pid)

    direct_vm.sender = direct_bob
    _warp_to(direct_vm, start + DAY + 60)
    contract.record_miss(pid)
    _warp_to(direct_vm, start + 2 * DAY + 60)
    contract.record_miss(pid)

    contract.force_settle(pid)
    p = contract.get_pact(pid)
    assert p["status"] == "LOST"
    assert p["miss_count"] == "2"

    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="only the winner can claim"):
        contract.claim(pid)

    direct_vm.sender = direct_bob
    contract.claim(pid)
    assert contract.get_pact(pid)["status"] == "SETTLED"


def test_force_settle_blocked_while_still_running(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    start = _start(120)
    pid = _create(direct_vm, contract, direct_alice, start=start)
    _join(direct_vm, contract, direct_bob, pid)

    direct_vm.sender = direct_bob
    _warp_to(direct_vm, start + DAY + 60)
    contract.record_miss(pid)

    with pytest.raises(Exception, match="not yet settleable"):
        contract.force_settle(pid)


def test_mixed_results_win_on_allowance(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(direct_vm, contract, direct_alice, periods=5, misses=1)
    _join(direct_vm, contract, direct_bob, pid)
    _mock_gym_page(direct_vm)

    script = ["KEPT", "MISSED", "KEPT", "KEPT", "KEPT"]
    for day, verdict in enumerate(script):
        direct_vm.clear_mocks()
        _mock_gym_page(direct_vm)
        _mock_verdict(direct_vm, verdict)
        _checkin(direct_vm, contract, direct_alice, pid, day)

    p = contract.get_pact(pid)
    assert p["kept_count"] == "4"
    assert p["miss_count"] == "1"

    direct_vm.sender = direct_alice
    contract.force_settle(pid)
    assert contract.get_pact(pid)["status"] == "WON"

    stats = contract.get_stats()
    assert stats["total_kept"] == "4"
    assert stats["total_missed"] == "1"
    assert stats["total_settled"] == "0"

    contract.claim(pid)
    assert contract.get_stats()["total_settled"] == "1"


def test_list_and_stats_views(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/streak_pact.py")
    _create(direct_vm, contract, direct_alice, commitment="Run 5km every morning")
    _create(direct_vm, contract, direct_alice, commitment="Write 500 words every day")

    listing = contract.list_pacts(0, 10)
    assert listing["total"] == "2"
    assert len(listing["items"]) == 2
    assert listing["items"][0]["status"] == "OPEN"

    stats = contract.get_stats()
    assert stats["total_created"] == "2"
    assert stats["total_settled"] == "0"


def test_create_rejects_stake_below_floor(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/streak_pact.py")
    direct_vm.sender = direct_alice
    direct_vm.value = 10**15 - 1
    with pytest.raises(Exception, match="stake below minimum"):
        contract.create_pact("gym daily", 3, 1, _start(120))
    direct_vm.value = 10**15
    pid = contract.create_pact("gym daily", 3, 1, _start(120))
    direct_vm.value = 0
    assert contract.get_pact(pid)["stake_atto"] == str(10**15)


def test_list_checkins_pagination(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    pid = _create(direct_vm, contract, direct_alice)
    _join(direct_vm, contract, direct_bob, pid)
    _mock_gym_page(direct_vm)

    script = ["KEPT", "MISSED", "KEPT"]
    for day, verdict in enumerate(script):
        direct_vm.clear_mocks()
        _mock_gym_page(direct_vm)
        _mock_verdict(direct_vm, verdict)
        _checkin(direct_vm, contract, direct_alice, pid, day)

    listing = contract.list_checkins(pid, 0, 10)
    assert listing["total"] == "3"
    assert [i["verdict"] for i in listing["items"]] == ["KEPT", "MISSED", "KEPT"]
    assert [i["period"] for i in listing["items"]] == ["0", "1", "2"]
    assert listing["items"][1]["method"] == "EVIDENCE"

    page = contract.list_checkins(pid, 1, 1)
    assert page["total"] == "3"
    assert len(page["items"]) == 1
    assert page["items"][0]["period"] == "1"

    empty = contract.list_checkins(pid, 5, 10)
    assert empty["total"] == "3"
    assert empty["items"] == []


def test_window_view_fields(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/streak_pact.py")
    start = _start(120)
    pid = _create(direct_vm, contract, direct_alice, start=start)
    _join(direct_vm, contract, direct_bob, pid)
    _mock_gym_page(direct_vm)
    _mock_verdict(direct_vm, "KEPT")

    _warp_to(direct_vm, start + 3600)
    p = contract.get_pact(pid)
    assert p["next_period"] == "0"
    assert p["window_open_now"] == "True"

    _checkin(direct_vm, contract, direct_alice, pid, 0)
    p = contract.get_pact(pid)
    assert p["next_period"] == "1"
    assert int(p["next_window_open"]) == start + DAY
