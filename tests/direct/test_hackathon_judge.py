import hashlib
import json
from datetime import datetime, timezone

import pytest


TEST_NOW_UNIX = 2_000_000_000
DEADLINE = TEST_NOW_UNIX + 600
APPEAL_WINDOW = 120
PRIZE = 10**18
JUDGMENT_TIMEOUT = 24 * 60 * 60
RULEBOOK = (
    "Projects must provide a public working demonstration, explain what was built, "
    "and show meaningful use of GenLayer rather than merely mentioning it."
)
RUBRIC = (
    "Score technical execution, completeness, usefulness, and clarity equally. "
    "A polished working project with verifiable evidence should score 80 or 100."
)


def _warp_to(direct_vm, unix_ts: int) -> None:
    direct_vm.warp(datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat())


def _deploy(direct_deploy):
    return direct_deploy("contracts/hackathon_judge.py")


def _address(value) -> str:
    return "0x" + bytes(value).hex()


def _create(direct_vm, contract, organizer, deadline=DEADLINE, capacity=4, minimum=60, appeal=APPEAL_WINDOW, prize=0):
    direct_vm.sender = organizer
    return contract.create_hackathon(
        "GenLayer Builders Sprint",
        "Best Intelligent Contract",
        RULEBOOK,
        RUBRIC,
        deadline,
        capacity,
        minimum,
        appeal,
        prize,
    )


def _submit(direct_vm, contract, entrant, hackathon_id, suffix="one"):
    _mock_evidence(direct_vm)
    direct_vm.sender = entrant
    return contract.submit_project(
        hackathon_id,
        "Project " + suffix.title(),
        "https://example.com/projects/" + suffix,
        "A public demonstration with architecture notes, implementation details, and reproducible results.",
    )


def _mock_evidence(direct_vm) -> None:
    direct_vm.mock_web(
        r".*example\.com/projects/.*",
        {
            "status": 200,
            "body": (
                "Project demo: a deployed GenLayer intelligent contract. The repository, "
                "architecture, test results, and live transaction examples are public."
            ),
        },
    )


def _mock_judgment(direct_vm, eligibility="ELIGIBLE", score=80, confidence=90, reason="Evidence satisfies the rules"):
    direct_vm.mock_llm(
        r".*independent hackathon jury.*",
        json.dumps(
            {
                "eligibility": eligibility,
                "score": score,
                "confidence": confidence,
                "reason": reason,
            }
        ),
    )


def _evaluate(direct_vm, contract, caller, hackathon_id, index):
    direct_vm.sender = caller
    contract.evaluate_submission(hackathon_id, index)


def test_create_hackathon_stores_immutable_terms(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_deploy)
    hackathon_id = _create(direct_vm, contract, direct_alice)

    hackathon = contract.get_hackathon(hackathon_id)
    assert hackathon["id"] == "hj-1"
    assert hackathon["organizer"].lower() == _address(direct_alice)
    assert hackathon["status"] == "OPEN"
    assert hackathon["phase"] == "OPEN"
    assert hackathon["rulebook"] == RULEBOOK
    assert hackathon["rubric"] == RUBRIC
    assert hackathon["max_submissions"] == "4"
    assert hackathon["min_winning_score"] == "60"
    assert hackathon["appeal_window_secs"] == str(APPEAL_WINDOW)
    assert hackathon["prize_atto"] == "0"
    assert hackathon["accepting_submissions"] is True


def test_create_hackathon_validates_deadline_capacity_and_score(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_alice

    with pytest.raises(Exception, match="deadline is too soon"):
        contract.create_hackathon("Valid event", "Valid award", RULEBOOK, RUBRIC, TEST_NOW_UNIX + 30, 4, 60, APPEAL_WINDOW, 0)
    with pytest.raises(Exception, match="max submissions must be"):
        contract.create_hackathon("Valid event", "Valid award", RULEBOOK, RUBRIC, DEADLINE, 9, 60, APPEAL_WINDOW, 0)
    with pytest.raises(Exception, match="minimum winning score"):
        contract.create_hackathon("Valid event", "Valid award", RULEBOOK, RUBRIC, DEADLINE, 4, 70, APPEAL_WINDOW, 0)
    with pytest.raises(Exception, match="appeal window"):
        contract.create_hackathon("Valid event", "Valid award", RULEBOOK, RUBRIC, DEADLINE, 4, 60, 30, 0)


def test_submission_flow_and_uniqueness(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_deploy)
    hackathon_id = _create(direct_vm, contract, direct_alice)
    index = _submit(direct_vm, contract, direct_bob, hackathon_id)

    assert index == "0"
    submission = contract.get_submission(hackathon_id, 0)
    assert submission["entrant"].lower() == _address(direct_bob)
    assert submission["status"] == "SUBMITTED"
    assert submission["score_band"] == "0"
    assert submission["evidence_url"].endswith("/one")
    assert len(submission["evidence_digest"]) == 64
    assert int(submission["resolution_deadline_unix"]) == DEADLINE + JUDGMENT_TIMEOUT
    assert submission["expirable"] is False
    evidence = contract.get_submission_evidence(hackathon_id, 0)
    assert evidence["evidence_digest"] == submission["evidence_digest"]
    assert "deployed GenLayer intelligent contract" in evidence["evidence_snapshot"]

    with pytest.raises(Exception, match="already submitted"):
        _submit(direct_vm, contract, direct_bob, hackathon_id, "two")

    profile = contract.get_builder_profile(direct_bob)
    assert profile == {
        "address": profile["address"],
        "entries": "1",
        "judged_entries": "0",
        "wins": "0",
        "available_credit_atto": "0",
    }


def test_submission_rejects_non_public_urls(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_deploy)
    hackathon_id = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob

    with pytest.raises(Exception, match="public HTTPS"):
        contract.submit_project(hackathon_id, "Unsafe", "http://example.com/demo", "A sufficiently long project summary for judging.")
    with pytest.raises(Exception, match="public host"):
        contract.submit_project(hackathon_id, "Unsafe", "https://localhost/demo", "A sufficiently long project summary for judging.")
    with pytest.raises(Exception, match="IP-literal"):
        contract.submit_project(hackathon_id, "Unsafe", "https://127.0.0.1/demo", "A sufficiently long project summary for judging.")


def test_only_empty_hackathon_can_be_cancelled(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_deploy)
    first = _create(direct_vm, contract, direct_alice)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="only the organizer"):
        contract.cancel_hackathon(first)

    direct_vm.sender = direct_alice
    contract.cancel_hackathon(first)
    assert contract.get_hackathon(first)["status"] == "CANCELLED"

    second = _create(direct_vm, contract, direct_alice, deadline=DEADLINE + 10)
    _submit(direct_vm, contract, direct_bob, second)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="with submissions cannot be cancelled"):
        contract.cancel_hackathon(second)


def test_evaluate_submission_uses_saved_evidence_and_score_band(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_deploy)
    hackathon_id = _create(direct_vm, contract, direct_alice)
    _submit(direct_vm, contract, direct_bob, hackathon_id)
    direct_vm.clear_mocks()
    _mock_judgment(direct_vm, score=87, confidence=93)

    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="submissions are still open"):
        contract.evaluate_submission(hackathon_id, 0)

    _warp_to(direct_vm, DEADLINE + 1)
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 0)

    submission = contract.get_submission(hackathon_id, 0)
    assert submission["status"] == "JUDGED"
    assert submission["eligibility"] == "ELIGIBLE"
    assert submission["score_band"] == "80"
    assert submission["confidence_bucket"] == "90"
    assert submission["reasoning"] == "Evidence satisfies the rules"
    assert contract.get_hackathon(hackathon_id)["status"] == "JUDGING"
    assert contract.get_builder_profile(direct_bob)["judged_entries"] == "1"


def test_ineligible_and_low_confidence_results_cannot_score(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    hackathon_id = _create(direct_vm, contract, direct_alice)
    _submit(direct_vm, contract, direct_bob, hackathon_id, "one")
    _submit(direct_vm, contract, direct_charlie, hackathon_id, "two")
    _warp_to(direct_vm, DEADLINE + 1)

    _mock_evidence(direct_vm)
    _mock_judgment(direct_vm, eligibility="INELIGIBLE", score=100)
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 0)
    first = contract.get_submission(hackathon_id, 0)
    assert first["status"] == "INELIGIBLE"
    assert first["score_band"] == "0"

    direct_vm.clear_mocks()
    _mock_evidence(direct_vm)
    _mock_judgment(direct_vm, eligibility="ELIGIBLE", score=100, confidence=40)
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 1)
    second = contract.get_submission(hackathon_id, 1)
    assert second["status"] == "INCONCLUSIVE"
    assert second["eligibility"] == "INCONCLUSIVE"
    assert second["score_band"] == "0"


def test_malformed_llm_output_reverts_without_reserving_evaluation(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_deploy)
    hackathon_id = _create(direct_vm, contract, direct_alice)
    _submit(direct_vm, contract, direct_bob, hackathon_id)
    _warp_to(direct_vm, DEADLINE + 1)
    _mock_evidence(direct_vm)
    direct_vm.mock_llm(r".*independent hackathon jury.*", "not-json")

    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="no JSON object found"):
        contract.evaluate_submission(hackathon_id, 0)
    assert contract.get_submission(hackathon_id, 0)["status"] == "SUBMITTED"
    assert contract.get_hackathon(hackathon_id)["evaluated_count"] == "0"


def test_finalize_selects_highest_score_and_issues_portable_credential(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    hackathon_id = _create(direct_vm, contract, direct_alice)
    _submit(direct_vm, contract, direct_bob, hackathon_id, "one")
    _submit(direct_vm, contract, direct_charlie, hackathon_id, "two")
    _warp_to(direct_vm, DEADLINE + 1)

    _mock_evidence(direct_vm)
    _mock_judgment(direct_vm, score=60)
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 0)

    direct_vm.clear_mocks()
    _mock_evidence(direct_vm)
    _mock_judgment(direct_vm, score=100)
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 1)

    direct_vm.sender = direct_bob
    _warp_to(direct_vm, DEADLINE + APPEAL_WINDOW + 2)
    contract.finalize_hackathon(hackathon_id)

    hackathon = contract.get_hackathon(hackathon_id)
    assert hackathon["status"] == "FINALIZED"
    assert hackathon["winner"].lower() == _address(direct_charlie)
    assert hackathon["winner_project"] == "Project Two"
    assert contract.get_submission(hackathon_id, 0)["status"] == "NOT_SELECTED"
    assert contract.get_submission(hackathon_id, 1)["status"] == "WINNER"
    assert contract.get_builder_profile(direct_charlie)["wins"] == "1"
    wins = contract.list_builder_wins(direct_charlie, 0, 10)
    assert wins["total"] == "1"
    assert wins["items"][0]["id"] == hackathon_id
    assert contract.get_stats()["total_credentials"] == "1"


def test_finalize_uses_earliest_submission_as_documented_tiebreak(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    hackathon_id = _create(direct_vm, contract, direct_alice)
    _submit(direct_vm, contract, direct_bob, hackathon_id, "one")
    _submit(direct_vm, contract, direct_charlie, hackathon_id, "two")
    _warp_to(direct_vm, DEADLINE + 1)

    _mock_evidence(direct_vm)
    _mock_judgment(direct_vm, score=80)
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 0)
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 1)
    contract.finalize_hackathon(hackathon_id)

    assert contract.get_hackathon(hackathon_id)["winner"].lower() == _address(direct_bob)


def test_finalize_requires_all_submissions_and_can_record_no_winner(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    hackathon_id = _create(direct_vm, contract, direct_alice, minimum=80)
    _submit(direct_vm, contract, direct_bob, hackathon_id, "one")
    _submit(direct_vm, contract, direct_charlie, hackathon_id, "two")
    _warp_to(direct_vm, DEADLINE + 1)
    _mock_evidence(direct_vm)
    _mock_judgment(direct_vm, score=60)
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 0)

    with pytest.raises(Exception, match="every submission"):
        contract.finalize_hackathon(hackathon_id)

    direct_vm.clear_mocks()
    _mock_evidence(direct_vm)
    _mock_judgment(direct_vm, eligibility="INELIGIBLE", score=100)
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 1)
    _warp_to(direct_vm, DEADLINE + APPEAL_WINDOW + 2)
    contract.finalize_hackathon(hackathon_id)

    hackathon = contract.get_hackathon(hackathon_id)
    assert hackathon["status"] == "NO_WINNER"
    assert hackathon["has_winner"] is False
    assert contract.get_stats()["total_no_winner"] == "1"


def test_lists_and_config_expose_consensus_policy(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_deploy)
    first = _create(direct_vm, contract, direct_alice)
    second = _create(direct_vm, contract, direct_alice, deadline=DEADLINE + 10)
    _submit(direct_vm, contract, direct_bob, second)

    hackathons = contract.list_hackathons(0, 10)
    assert hackathons["total"] == "2"
    assert [item["id"] for item in hackathons["items"]] == [second, first]
    submissions = contract.list_submissions(second, 0, 10)
    assert submissions["total"] == "1"
    assert submissions["items"][0]["project_name"] == "Project One"

    config = contract.get_config()
    assert config["version"] == "2.1.0"
    assert config["evidence_schema"] == "hackathon-judge-snapshot-v3"
    assert config["funding_model"] == "WITHDRAWABLE_DEPOSIT_CREDIT_V1"
    assert config["evidence_policy"] == "VALIDATOR_AGREED_IMMUTABLE_RENDER_SNAPSHOT"
    assert config["judging_policy"] == "INDEPENDENT_COMPARATIVE_DECISION_FIELDS"
    assert config["reasoning_policy"] == "WORDING_EXEMPT_FROM_EQUIVALENCE"
    assert config["liveness_policy"] == "PERMISSIONLESS_TIMEOUT_TO_INCONCLUSIVE"
    assert config["judgment_timeout_secs"] == str(JUDGMENT_TIMEOUT)
    assert config["max_submissions"] == "8"


def test_evidence_capture_consensus_binds_snapshot_and_digest(direct_deploy):
    contract = _deploy(direct_deploy)
    snapshot = "Public source, deployment transaction, and live demo are independently verifiable."
    digest = hashlib.sha256(snapshot.encode("utf-8")).hexdigest()

    assert contract._capture_results_match(
        {"snapshot": snapshot, "digest": digest},
        {"snapshot": snapshot, "digest": digest},
    ) is True
    assert contract._capture_results_match(
        {"snapshot": "forged leader snapshot", "digest": digest},
        {"snapshot": snapshot, "digest": digest},
    ) is False
    assert contract._capture_results_match(
        {"snapshot": snapshot, "digest": "0" * 64},
        {"snapshot": snapshot, "digest": "0" * 64},
    ) is False


def test_entrant_can_appeal_with_clarification_and_new_snapshot(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy)
    hackathon_id = _create(direct_vm, contract, direct_alice)
    _submit(direct_vm, contract, direct_bob, hackathon_id)
    _warp_to(direct_vm, DEADLINE + 1)
    direct_vm.clear_mocks()
    _mock_judgment(direct_vm, eligibility="INELIGIBLE", score=0, reason="Deployment proof is missing")
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 0)

    rejected = contract.get_submission(hackathon_id, 0)
    assert rejected["appealable"] is True
    assert int(rejected["appeal_deadline_unix"]) == DEADLINE + 1 + APPEAL_WINDOW

    direct_vm.clear_mocks()
    _mock_evidence(direct_vm)
    direct_vm.sender = direct_bob
    contract.appeal_submission(
        hackathon_id,
        0,
        "The new evidence page includes the public deployment transaction and complete test output.",
        "https://example.com/projects/appeal",
    )
    pending = contract.get_submission(hackathon_id, 0)
    assert pending["status"] == "APPEAL_PENDING"
    assert pending["appeal_count"] == "1"
    assert len(pending["appeal_evidence_digest"]) == 64

    direct_vm.clear_mocks()
    _mock_judgment(direct_vm, eligibility="ELIGIBLE", score=80, reason="Appeal evidence establishes deployment")
    direct_vm.sender = direct_alice
    contract.resolve_appeal(hackathon_id, 0)
    resolved = contract.get_submission(hackathon_id, 0)
    assert resolved["status"] == "JUDGED"
    assert resolved["eligibility"] == "ELIGIBLE"
    assert resolved["score_band"] == "80"
    assert resolved["appeal_resolved"] is True


def test_appeal_is_entrant_only_and_expires(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    hackathon_id = _create(direct_vm, contract, direct_alice)
    _submit(direct_vm, contract, direct_bob, hackathon_id)
    _warp_to(direct_vm, DEADLINE + 1)
    direct_vm.clear_mocks()
    _mock_judgment(direct_vm, eligibility="INCONCLUSIVE", score=0)
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 0)

    direct_vm.sender = direct_charlie
    with pytest.raises(Exception, match="only the entrant"):
        contract.appeal_submission(hackathon_id, 0, "The public evidence is complete and should be reconsidered.", "")

    _warp_to(direct_vm, DEADLINE + APPEAL_WINDOW + 2)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="appeal window has closed"):
        contract.appeal_submission(hackathon_id, 0, "The public evidence is complete and should be reconsidered.", "")


def test_permissionless_timeout_unblocks_initial_judgment_and_refunds_prize(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = PRIZE
    contract.deposit()
    direct_vm.value = 0
    hackathon_id = _create(direct_vm, contract, direct_alice, prize=PRIZE)
    _submit(direct_vm, contract, direct_bob, hackathon_id)

    direct_vm.sender = direct_charlie
    _warp_to(direct_vm, DEADLINE + JUDGMENT_TIMEOUT)
    with pytest.raises(Exception, match="timeout has not elapsed"):
        contract.expire_unresolved_submission(hackathon_id, 0)

    _warp_to(direct_vm, DEADLINE + JUDGMENT_TIMEOUT + 1)
    contract.expire_unresolved_submission(hackathon_id, 0)
    submission = contract.get_submission(hackathon_id, 0)
    assert submission["status"] == "INCONCLUSIVE"
    assert submission["eligibility"] == "INCONCLUSIVE"
    assert submission["expirable"] is False
    assert contract.get_hackathon(hackathon_id)["evaluated_count"] == "1"
    assert contract.get_builder_profile(direct_bob)["judged_entries"] == "1"

    contract.finalize_hackathon(hackathon_id)
    assert contract.get_hackathon(hackathon_id)["status"] == "NO_WINNER"
    assert contract.get_credit(direct_alice) == str(PRIZE)


def test_permissionless_timeout_unblocks_pending_appeal(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    hackathon_id = _create(direct_vm, contract, direct_alice)
    _submit(direct_vm, contract, direct_bob, hackathon_id)
    _warp_to(direct_vm, DEADLINE + 1)
    direct_vm.clear_mocks()
    _mock_judgment(direct_vm, eligibility="INCONCLUSIVE", score=0)
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 0)

    direct_vm.clear_mocks()
    _mock_evidence(direct_vm)
    direct_vm.sender = direct_bob
    contract.appeal_submission(
        hackathon_id,
        0,
        "The replacement evidence includes exact public identifiers for independent verification.",
        "https://example.com/projects/appeal-timeout",
    )
    pending = contract.get_submission(hackathon_id, 0)
    resolution_deadline = int(pending["resolution_deadline_unix"])

    direct_vm.sender = direct_charlie
    _warp_to(direct_vm, resolution_deadline + 1)
    contract.expire_unresolved_submission(hackathon_id, 0)
    expired = contract.get_submission(hackathon_id, 0)
    assert expired["status"] == "INCONCLUSIVE"
    assert expired["appeal_resolved"] is True
    assert contract.get_hackathon(hackathon_id)["evaluated_count"] == "1"

    contract.finalize_hackathon(hackathon_id)
    assert contract.get_hackathon(hackathon_id)["status"] == "NO_WINNER"


def test_prize_credit_moves_to_winner_and_remains_withdrawable(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = PRIZE
    contract.deposit()
    direct_vm.value = 0
    assert contract.get_credit(direct_alice) == str(PRIZE)

    hackathon_id = _create(direct_vm, contract, direct_alice, prize=PRIZE)
    assert contract.get_credit(direct_alice) == "0"
    _submit(direct_vm, contract, direct_bob, hackathon_id)
    _warp_to(direct_vm, DEADLINE + 1)
    direct_vm.clear_mocks()
    _mock_judgment(direct_vm, score=100)
    _evaluate(direct_vm, contract, direct_alice, hackathon_id, 0)
    contract.finalize_hackathon(hackathon_id)

    assert contract.get_credit(direct_bob) == str(PRIZE)
    assert contract.get_hackathon(hackathon_id)["prize_released"] is True
    assert contract.get_stats()["total_prize_awarded_atto"] == str(PRIZE)
    direct_vm.sender = direct_bob
    contract.withdraw_credit()
    assert contract.get_credit(direct_bob) == "0"


def test_cancelled_prize_returns_to_organizer_credit(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = PRIZE
    contract.deposit()
    direct_vm.value = 0
    hackathon_id = _create(direct_vm, contract, direct_alice, prize=PRIZE)
    assert contract.get_credit(direct_alice) == "0"
    contract.cancel_hackathon(hackathon_id)
    assert contract.get_credit(direct_alice) == str(PRIZE)
    assert contract.get_stats()["total_prize_refunded_atto"] == str(PRIZE)
