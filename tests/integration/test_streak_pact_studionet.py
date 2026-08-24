import time

from gltest import get_contract_factory, get_accounts
from gltest.assertions import tx_execution_succeeded

STAKE = 10**15
PERIOD_SECS = 60
JOIN_LEAD = 65


def _wait_until(unix_ts: int) -> None:
    while time.time() < unix_ts + 2:
        time.sleep(5)


def _create(alice_contract, commitment, periods, misses, start):
    tx = alice_contract.create_pact(
        args=[commitment, periods, misses, start]
    ).transact(value=STAKE)
    assert tx_execution_succeeded(tx)
    listing = alice_contract.list_pacts(args=[0, 100]).call()
    items = [i for i in listing["items"] if i["commitment"][:120] == commitment[:120]]
    return items[-1]["id"]


def test_full_streak_wins_on_studionet():
    factory = get_contract_factory("StreakPact")
    contract = factory.deploy(args=[0, PERIOD_SECS])

    accounts = get_accounts()
    alice, bob = accounts[0], accounts[1]
    bob_contract = contract.connect(bob)

    commitment = (
        "Visit https://example.com/ once per day; successfully loading "
        "the page counts as completing today's task."
    )
    start = int(time.time()) + JOIN_LEAD
    pid = _create(contract, commitment, 3, 1, start)

    p = contract.get_pact(args=[pid]).call()
    assert p["status"] == "OPEN"
    assert p["stake_atto"] == str(STAKE)

    join_tx = bob_contract.join_pact(args=[pid]).transact(value=STAKE)
    assert tx_execution_succeeded(join_tx)
    assert contract.get_pact(args=[pid]).call()["status"] == "LIVE"

    for day in range(3):
        _wait_until(start + day * PERIOD_SECS)
        tx = contract.check_in(
            args=[pid, "", "https://example.com/"]
        ).transact()
        assert tx_execution_succeeded(tx)
        c = contract.get_checkin(args=[pid, day]).call()
        assert c["verdict"] == "KEPT"

    settle_tx = bob_contract.force_settle(args=[pid]).transact()
    assert tx_execution_succeeded(settle_tx)
    p = contract.get_pact(args=[pid]).call()
    assert p["status"] == "WON"
    assert p["kept_count"] == "3"
    assert p["miss_count"] == "0"

    claim_tx = contract.claim(args=[pid]).transact()
    assert tx_execution_succeeded(claim_tx)
    assert contract.get_pact(args=[pid]).call()["status"] == "SETTLED"

    stats = contract.get_stats().call()
    assert stats["total_kept"] == "3"
    assert stats["total_settled"] == "1"


def test_forfeit_path_taker_wins_on_studionet():
    factory = get_contract_factory("StreakPact")
    contract = factory.deploy(args=[0, PERIOD_SECS])

    accounts = get_accounts()
    alice, bob = accounts[0], accounts[1]
    bob_contract = contract.connect(bob)

    commitment = (
        "Visit https://example.com/ once per day; successfully loading "
        "the page counts as completing today's task."
    )
    start = int(time.time()) + JOIN_LEAD
    pid = _create(contract, commitment, 3, 0, start)

    join_tx = bob_contract.join_pact(args=[pid]).transact(value=STAKE)
    assert tx_execution_succeeded(join_tx)

    _wait_until(start + PERIOD_SECS)
    miss_tx = bob_contract.record_miss(args=[pid]).transact()
    assert tx_execution_succeeded(miss_tx)

    c = contract.get_checkin(args=[pid, 0]).call()
    assert c["verdict"] == "MISSED"
    assert c["method"] == "AUTO_MISS"

    settle_tx = bob_contract.force_settle(args=[pid]).transact()
    assert tx_execution_succeeded(settle_tx)
    assert contract.get_pact(args=[pid]).call()["status"] == "LOST"

    claim_tx = bob_contract.claim(args=[pid]).transact()
    assert tx_execution_succeeded(claim_tx)
    p = contract.get_pact(args=[pid]).call()
    assert p["status"] == "SETTLED"
    assert p["miss_count"] == "1"


def test_cancel_open_pact_before_start_on_studionet():
    factory = get_contract_factory("StreakPact")
    contract = factory.deploy(args=[0, PERIOD_SECS])

    commitment = "Meditate 10 minutes daily"
    pid = _create(contract, commitment, 3, 0, int(time.time()) + JOIN_LEAD)

    tx = contract.cancel_pact(args=[pid]).transact()
    assert tx_execution_succeeded(tx)
    assert contract.get_pact(args=[pid]).call()["status"] == "VOIDED"

    stats = contract.get_stats().call()
    assert int(stats["total_created"]) >= 1
