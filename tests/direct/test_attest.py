"""Financial and evidence-consensus regressions for ATTEST."""

import json
from datetime import datetime, timezone

import pytest


NOW = 2_000_000_000
BOND = 4 * 10**15
AUTHOR_URL = "https://example.org/attest-primary"
CHALLENGE_URL = "https://example.net/attest-challenge"
AUTHOR_BODY = "The public October distribution record contains exactly 400 recipients.\nEvery listed recipient has a nonzero transfer."
CHALLENGE_BODY = "The independent October audit lists only 398 unique recipients.\nTwo records are duplicate addresses."


def address(account):
    return "0x" + bytes(account).hex()


def warp(vm, timestamp):
    vm.warp(datetime.fromtimestamp(timestamp, timezone.utc).isoformat())


def create(vm, deploy, author, bond=BOND, source_url=AUTHOR_URL):
    contract = deploy("contracts/attest.py")
    vm.sender = author
    vm.value = bond
    contract.deposit()
    vm.value = 0
    claim_id = contract.create_claim(
        "October grant recipients",
        "The October grant reached exactly 400 unique recipients with a nonzero transfer to each.",
        "SUPPORTED if the October distribution record shows 400 unique paid recipients; DISPROVEN if a verifiable audit proves fewer; otherwise INCONCLUSIVE.",
        json.dumps([source_url]),
        3600,
        bond,
    )
    return contract, claim_id


def challenge(vm, contract, claim_id, challenger):
    vm.sender = challenger
    amount = int(contract.get_claim(claim_id)["challenge_bond_atto"])
    vm.value = amount
    contract.deposit()
    vm.value = 0
    contract.challenge(
        claim_id,
        "The published list contains two repeated recipient addresses, so fewer than 400 were paid.",
        json.dumps([CHALLENGE_URL]),
    )
    return amount


def evidence(vm, outcome="SUPPORTED", author_body=AUTHOR_BODY, challenge_body=CHALLENGE_BODY):
    vm.mock_web(AUTHOR_URL, {"status": 200, "body": author_body})
    vm.mock_web(CHALLENGE_URL, {"status": 200, "body": challenge_body})
    vm.mock_llm(
        r".*independent adjudicator for ATTEST.*",
        json.dumps({
            "outcome": outcome,
            "reason": "The cited public record determines the result under the locked recipient rule.",
            "citations": [] if outcome == "INCONCLUSIVE" else [{"source_id": "S1", "line": 1}],
        }),
    )


@pytest.mark.parametrize("outcome,winner", [("SUPPORTED", "author"), ("DISPROVEN", "challenger")])
def test_conclusive_settlement_is_exact_and_validator_checks_evidence(
    direct_vm, direct_deploy, direct_alice, direct_bob, outcome, winner
):
    contract, claim_id = create(direct_vm, direct_deploy, direct_alice)
    counterbond = challenge(direct_vm, contract, claim_id, direct_bob)
    warp(direct_vm, NOW + 3600)
    evidence(direct_vm, outcome)
    contract.resolve(claim_id)
    assert direct_vm.run_validator()
    claim = contract.get_claim(claim_id)
    assert claim["outcome"] == outcome
    assert claim["citations"][0]["excerpt"] == AUTHOR_BODY.splitlines()[0]
    assert claim["evidence_snapshot"][0]["status"] == "READABLE"
    winning_address = address(direct_alice if winner == "author" else direct_bob)
    losing_address = address(direct_bob if winner == "author" else direct_alice)
    assert int(contract.get_credit(winning_address)) == BOND + counterbond
    assert int(contract.get_credit(losing_address)) == 0
    assert int(contract.get_stats()["total_locked_atto"]) == 0
    assert int(contract.get_stats()["total_settled_atto"]) == BOND + counterbond
    direct_vm.sender = direct_alice if winner == "author" else direct_bob
    contract.withdraw_credit()
    assert int(contract.get_credit(winning_address)) == 0
    with pytest.raises(Exception, match="no available credit"):
        contract.withdraw_credit()
    with pytest.raises(Exception, match="only a challenged claim"):
        contract.resolve(claim_id)


def test_uncontested_refund_does_not_claim_independent_verification(direct_vm, direct_deploy, direct_alice):
    contract, claim_id = create(direct_vm, direct_deploy, direct_alice)
    with pytest.raises(Exception, match="still open"):
        contract.finalize_uncontested(claim_id)
    warp(direct_vm, NOW + 3600)
    contract.finalize_uncontested(claim_id)
    assert contract.get_claim(claim_id)["outcome"] == "UNCONTESTED"
    assert int(contract.get_credit(address(direct_alice))) == BOND
    assert int(contract.get_stats()["total_locked_atto"]) == 0


def test_inconclusive_returns_each_bond(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, claim_id = create(direct_vm, direct_deploy, direct_alice)
    counterbond = challenge(direct_vm, contract, claim_id, direct_bob)
    warp(direct_vm, NOW + 3600)
    direct_vm.mock_web(AUTHOR_URL, {"status": 503, "body": ""})
    direct_vm.mock_web(CHALLENGE_URL, {"status": 503, "body": ""})
    contract.resolve(claim_id)
    assert direct_vm.run_validator()
    assert contract.get_claim(claim_id)["outcome"] == "INCONCLUSIVE"
    assert int(contract.get_credit(address(direct_alice))) == BOND
    assert int(contract.get_credit(address(direct_bob))) == counterbond


def test_timeout_refunds_disputed_bonds_without_a_model_decision(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, claim_id = create(direct_vm, direct_deploy, direct_alice)
    counterbond = challenge(direct_vm, contract, claim_id, direct_bob)
    with pytest.raises(Exception, match="timeout has not elapsed"):
        contract.expire_challenged(claim_id)
    warp(direct_vm, NOW + 3600 + 7 * 86400)
    with pytest.raises(Exception, match="adjudication period expired"):
        contract.resolve(claim_id)
    direct_vm.sender = direct_bob
    contract.expire_challenged(claim_id)
    assert contract.get_claim(claim_id)["outcome"] == "TIMEOUT_REFUND"
    assert int(contract.get_credit(address(direct_alice))) == BOND
    assert int(contract.get_credit(address(direct_bob))) == counterbond
    assert int(contract.get_stats()["total_locked_atto"]) == 0
    assert contract.get_stats()["total_timeout_refunded"] == "1"
    with pytest.raises(Exception, match="only an unresolved"):
        contract.expire_challenged(claim_id)


def test_oversize_source_cannot_support_a_conclusive_result(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, claim_id = create(direct_vm, direct_deploy, direct_alice)
    challenge(direct_vm, contract, claim_id, direct_bob)
    warp(direct_vm, NOW + 3600)
    direct_vm.mock_web(AUTHOR_URL, {"status": 200, "body": "A" * 6001})
    direct_vm.mock_web(CHALLENGE_URL, {"status": 503, "body": ""})
    contract.resolve(claim_id)
    claim = contract.get_claim(claim_id)
    assert claim["outcome"] == "INCONCLUSIVE"
    assert claim["evidence_snapshot"][0]["status"] == "TOO_LARGE"
    assert claim["evidence_snapshot"][0]["text"] == ""


def test_validator_rejects_a_changed_source_even_with_same_outcome(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, claim_id = create(direct_vm, direct_deploy, direct_alice)
    challenge(direct_vm, contract, claim_id, direct_bob)
    warp(direct_vm, NOW + 3600)
    evidence(direct_vm)
    contract.resolve(claim_id)
    direct_vm.clear_mocks()
    evidence(direct_vm, author_body="The public October distribution record now contains only 398 recipients.\nThe page was edited after the first fetch.")
    assert not direct_vm.run_validator()


def test_challenge_inputs_and_deadlines_fail_closed(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, claim_id = create(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="authors cannot challenge"):
        contract.challenge(claim_id, "I dispute this October recipient count.", json.dumps([CHALLENGE_URL]))
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="insufficient available credit"):
        contract.challenge(claim_id, "I dispute this October recipient count.", json.dumps([CHALLENGE_URL]))
    warp(direct_vm, NOW + 3600)
    with pytest.raises(Exception, match="not accepting challenges"):
        contract.challenge(claim_id, "I dispute this October recipient count.", json.dumps([CHALLENGE_URL]))


def test_failed_post_keeps_deposit_withdrawable(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/attest.py")
    direct_vm.sender = direct_alice
    direct_vm.value = BOND
    contract.deposit()
    direct_vm.value = 0
    with pytest.raises(Exception, match="evidence URL"):
        contract.create_claim(
            "October grant recipients",
            "The October grant reached exactly 400 unique recipients with a nonzero transfer to each.",
            "SUPPORTED if 400 unique recipients received a transfer; otherwise INCONCLUSIVE.",
            json.dumps(["https://localhost/private"]),
            3600,
            BOND,
        )
    assert int(contract.get_credit(address(direct_alice))) == BOND
    assert contract.get_stats()["total_created"] == "0"
    contract.withdraw_credit()
    assert contract.get_credit(address(direct_alice)) == "0"
