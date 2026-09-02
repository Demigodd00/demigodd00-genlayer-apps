"""Hosted StudioNet smoke test for the matched two-wallet challenge path."""

import time

from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_succeeded

STAKE = 10**15
PERIOD_SECS = 60
APPEAL_WINDOW_SECS = 300


def test_two_wallet_challenge_join_locks_the_matched_pot_on_studionet():
    factory = get_contract_factory("StreakPactV2")
    alice, bob = get_accounts()[0], get_accounts()[1]
    contract = factory.deploy(args=[alice.address, 0, PERIOD_SECS, APPEAL_WINDOW_SECS])
    start = int(time.time()) + 240

    create_tx = contract.create_pact(
        args=[
            "CHALLENGE",
            "Two-wallet StudioNet challenge",
            "Publish one approved immutable activity record during every configured period.",
            3,
            1,
            start,
            bob.address,
            alice.address,
        ]
    ).transact(value=STAKE)
    assert tx_execution_succeeded(create_tx)

    listing = contract.list_user_pacts(args=[alice.address, 0, 25]).call()
    pact_id = listing["items"][-1]["id"]
    assert contract.get_pact(args=[pact_id]).call()["status"] == "OPEN"

    bob_contract = contract.connect(bob)
    join_tx = bob_contract.join_pact(args=[pact_id]).transact(value=STAKE)
    assert tx_execution_succeeded(join_tx)

    pact = contract.get_pact(args=[pact_id]).call()
    bob_listing = contract.list_user_pacts(args=[bob.address, 0, 25]).call()
    assert pact["status"] == "LIVE"
    assert pact["mode"] == "CHALLENGE"
    assert pact["taker"].lower() == bob.address.lower()
    assert pact["pot_atto"] == str(2 * STAKE)
    assert bob_listing["items"][-1]["id"] == pact_id

    cancel_tx = contract.cancel_before_start(args=[pact_id]).transact()
    assert not tx_execution_succeeded(cancel_tx)
    assert contract.get_pact(args=[pact_id]).call()["status"] == "LIVE"
