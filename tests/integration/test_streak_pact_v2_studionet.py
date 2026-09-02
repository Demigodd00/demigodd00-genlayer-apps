import time

from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_succeeded

STAKE = 10**15
PERIOD_SECS = 60
APPEAL_WINDOW_SECS = 300


def _wait_until(unix_ts: int) -> None:
    while time.time() < unix_ts + 2:
        time.sleep(5)


def test_v2_zero_checkins_becomes_provisional_loss_on_studionet():
    factory = get_contract_factory("StreakPactV2")
    alice, bob = get_accounts()[0], get_accounts()[1]
    contract = factory.deploy(args=[alice.address, 0, PERIOD_SECS, APPEAL_WINDOW_SECS])
    # Leave enough headroom for StudioNet transaction finality before the
    # contract-enforced 60-second start lead is evaluated.
    start = int(time.time()) + 180
    create_tx = contract.create_pact(
        args=[
            "SELF",
            "Three-period verification test",
            "Publish one immutable activity record during every configured period.",
            3,
            0,
            start,
            bob.address,
            alice.address,
        ]
    ).transact(value=STAKE)
    assert tx_execution_succeeded(create_tx)

    listing = contract.list_user_pacts(args=[alice.address, 0, 25]).call()
    pact_id = listing["items"][-1]["id"]
    assert contract.get_pact(args=[pact_id]).call()["status"] == "LIVE"

    _wait_until(start + 3 * PERIOD_SECS)
    settle_tx = contract.propose_settlement(args=[pact_id]).transact()
    assert tx_execution_succeeded(settle_tx)

    pact = contract.get_pact(args=[pact_id]).call()
    assert pact["status"] == "PROVISIONAL_LOST"
    assert pact["miss_count"] == "3"
    assert pact["appeal_open"] is True

    early_finalize = contract.finalize_settlement(args=[pact_id]).transact()
    assert not tx_execution_succeeded(early_finalize)

    _wait_until(int(pact["appeal_deadline_unix"]))
    finalize_tx = contract.finalize_settlement(args=[pact_id]).transact()
    assert tx_execution_succeeded(finalize_tx)
    assert contract.get_pact(args=[pact_id]).call()["status"] == "LOST"

    bob_contract = contract.connect(bob)
    claim_tx = bob_contract.claim(args=[pact_id]).transact()
    assert tx_execution_succeeded(claim_tx)
    assert contract.get_pact(args=[pact_id]).call()["status"] == "SETTLED"
