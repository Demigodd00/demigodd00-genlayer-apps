import time

from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_succeeded

POT = 10**15
CHALLENGE_WINDOW_SECS = 300
APPEAL_WINDOW_SECS = 300
DEADLINE_LEAD_SECS = 310


def _wait_until(unix_ts: int) -> None:
    while time.time() < unix_ts + 2:
        time.sleep(5)


def test_cancel_refund_path_on_studionet():
    factory = get_contract_factory("BountyForge")
    contract = factory.deploy(args=[0, CHALLENGE_WINDOW_SECS, APPEAL_WINDOW_SECS])

    alice, bob = get_accounts()[0], get_accounts()[1]
    create_tx = contract.create_bounty(
        args=[
            "Fix flaky CI on main",
            "Main branch must pass the full test suite three consecutive times.",
            "https://github.com/genlayerlabs/genvm/issues/1",
            int(time.time()) + DEADLINE_LEAD_SECS + 3600,
        ]
    ).transact(value=POT)
    assert tx_execution_succeeded(create_tx)

    listing = contract.list_bounties(args=[0, 25]).call()
    bounty_id = listing["items"][-1]["id"]
    bounty = contract.get_bounty(args=[bounty_id]).call()
    assert bounty["status"] == "OPEN"
    assert bounty["cancellable"] is True

    foreign_cancel_tx = contract.connect(bob).cancel_bounty(args=[bounty_id]).transact()
    assert not tx_execution_succeeded(foreign_cancel_tx)

    cancel_tx = contract.connect(alice).cancel_bounty(args=[bounty_id]).transact()
    assert tx_execution_succeeded(cancel_tx)

    bounty = contract.get_bounty(args=[bounty_id]).call()
    assert bounty["status"] == "CANCELLED"
    assert contract.get_stats().call()["total_cancelled"] == "1"

    double_cancel_tx = contract.connect(alice).cancel_bounty(args=[bounty_id]).transact()
    assert not tx_execution_succeeded(double_cancel_tx)


def test_expire_refund_path_on_studionet():
    factory = get_contract_factory("BountyForge")
    contract = factory.deploy(args=[0, CHALLENGE_WINDOW_SECS, APPEAL_WINDOW_SECS])

    alice = get_accounts()[0]
    deadline = int(time.time()) + DEADLINE_LEAD_SECS
    create_tx = contract.create_bounty(
        args=[
            "Document the storage layout",
            "README section describing every storage slot and its format.",
            "https://github.com/genlayerlabs/genvm/issues/2",
            deadline,
        ]
    ).transact(value=POT)
    assert tx_execution_succeeded(create_tx)

    listing = contract.list_bounties(args=[0, 25]).call()
    bounty_id = listing["items"][-1]["id"]

    early_expire_tx = contract.expire_bounty(args=[bounty_id]).transact()
    assert not tx_execution_succeeded(early_expire_tx)

    _wait_until(deadline)
    expire_tx = contract.expire_bounty(args=[bounty_id]).transact()
    assert tx_execution_succeeded(expire_tx)

    bounty = contract.get_bounty(args=[bounty_id]).call()
    assert bounty["status"] == "REFUNDED"
    assert contract.get_stats().call()["total_refunded"] == "1"
