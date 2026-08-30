import time

import pytest

from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_succeeded


def _wait_until(unix_ts: int) -> None:
    while time.time() <= unix_ts + 2:
        time.sleep(5)


@pytest.mark.slow
def test_hackathon_judge_reaches_consensus_on_rendered_evidence_studionet():
    factory = get_contract_factory("HackathonJudge")
    contract = factory.deploy(args=[])
    config = contract.get_config(args=[]).call()
    assert config["version"] == "2.1.0"
    assert config["evidence_schema"] == "hackathon-judge-snapshot-v3"
    assert config["liveness_policy"] == "PERMISSIONLESS_TIMEOUT_TO_INCONCLUSIVE"
    accounts = get_accounts()
    entrant_contract = contract.connect(accounts[1])

    unique = str(int(time.time()))
    name = "Hackathon Judge StudioNet Smoke " + unique
    deadline = int(time.time()) + 75
    create_receipt = contract.create_hackathon(
        args=[
            name,
            "Example Evidence Award",
            (
                "A submission is eligible only when the rendered page identifies itself as Example Domain "
                "and states that the domain is intended for illustrative examples in documents."
            ),
            (
                "Award exactly 80 points when both required facts are visible. Award zero and mark the project "
                "ineligible or inconclusive when either fact is absent."
            ),
            deadline,
            1,
            80,
            60,
            0,
        ]
    ).transact()
    assert tx_execution_succeeded(create_receipt)

    listing = contract.list_hackathons(args=[0, 25]).call()
    matching = [item for item in listing["items"] if item["name"] == name]
    assert len(matching) == 1
    hackathon_id = matching[0]["id"]

    submit_receipt = entrant_contract.submit_project(
        args=[
            hackathon_id,
            "Example Domain Evidence",
            "https://example.com/",
            "A public evidence page used to verify the complete StudioNet render and consensus path.",
        ]
    ).transact()
    assert tx_execution_succeeded(submit_receipt)
    saved = contract.get_submission(args=[hackathon_id, 0]).call()
    assert len(saved["evidence_digest"]) == 64

    _wait_until(deadline)
    evaluate_receipt = contract.evaluate_submission(args=[hackathon_id, 0]).transact()
    assert tx_execution_succeeded(evaluate_receipt)
    submission = contract.get_submission(args=[hackathon_id, 0]).call()
    assert submission["eligibility"] == "ELIGIBLE"
    assert submission["score_band"] == "80"

    finalize_receipt = contract.finalize_hackathon(args=[hackathon_id]).transact()
    assert tx_execution_succeeded(finalize_receipt)
    hackathon = contract.get_hackathon(args=[hackathon_id]).call()
    assert hackathon["status"] == "FINALIZED"
    assert hackathon["winner"].lower() == accounts[1].address.lower()
    assert contract.get_builder_profile(args=[accounts[1].address]).call()["wins"] == "1"
