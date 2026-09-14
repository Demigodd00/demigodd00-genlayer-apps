"""Milestone regressions; old v2.3 source and tests deliberately remain intact."""
import copy
import hashlib
import json
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest

_spec = spec_from_file_location("hj_baseline_helpers", Path(__file__).with_name("test_hackathon_judge.py"))
old = module_from_spec(_spec)
_spec.loader.exec_module(old)

NOW, DEADLINE, WINDOW = old.TEST_NOW_UNIX, old.DEADLINE, old.APPEAL_WINDOW
CRITERIA = [
    {"id": "execution", "name": "Implementation", "description": "Assess the completeness of the working implementation.", "weight": 70},
    {"id": "clarity", "name": "Clarity", "description": "Assess the quality and reproducibility of the documentation.", "weight": 30},
]
STATEMENT = "Please reconsider the implementation criterion using the supplied evidence."


def deploy(direct_vm, direct_deploy, owner, criteria=None, prize=0, minimum=60):
    contract = direct_deploy("contracts/hackathon_judge_scorecards.py")
    direct_vm.sender = owner
    if prize:
        direct_vm.value = prize
        contract.deposit()
        direct_vm.value = 0
    event = contract.create_hackathon("Scorecard event", "Best verified build", old.RULEBOOK,
                                     json.dumps(CRITERIA if criteria is None else criteria), DEADLINE, 4, minimum, WINDOW, prize)
    return contract, event


def judgment(direct_vm, scores=(80, 60), label="ELIGIBLE", confidence=90, target="", ref_source="original", mutate=None):
    selected = [row for row in CRITERIA if not target or row["id"] == target]
    raw = {"eligibility": label, "confidence": confidence, "reason": "Assessment of the frozen project evidence.",
           "criteria": [{"id": row["id"], "score": score, "reason": "Supported by the project description.",
                         "refs": [{"source": ref_source, "start": 1, "end": 1}] if score else []}
                        for row, score in zip(selected, scores)]}
    if mutate:
        mutate(raw)
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*independent hackathon jury.*", json.dumps(raw))
    return raw


def ready(direct_vm, direct_deploy, owner, entrant, scores=(80, 60), label="ELIGIBLE", prize=0, minimum=60):
    contract, event = deploy(direct_vm, direct_deploy, owner, prize=prize, minimum=minimum)
    old._submit(direct_vm, contract, entrant, event)
    old._warp_to(direct_vm, DEADLINE + 1)
    judgment(direct_vm, scores, label)
    contract.evaluate_submission(event, 0)
    return contract, event


def close_window(direct_vm, contract, event):
    old._warp_to(direct_vm, int(contract.get_hackathon(event)["common_appeal_deadline_unix"]) + 1)


def test_weighted_scorecard_and_citations_are_reproducible(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, e = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    event = c.get_hackathon(e)
    history = c.get_scorecard_history(e, 0)
    entry = c.get_submission(e, 0)
    assert event["criteria"] == CRITERIA
    assert event["rubric_digest"] == hashlib.sha256(event["rubric"].encode()).hexdigest()
    assert entry["score_total_bps"] == "7400"
    assert entry["appealable"] is True
    assert history["original"] == history["current"]
    assert history["original_digest"] == history["current_digest"]
    assert history["original_rank"] == history["current_rank"] == "1"
    assert history["current"]["decision"]["criteria"][0]["refs"][0]["excerpt"] == c.get_submission_evidence(e, 0)["evidence_snapshot"].splitlines()[0]


def test_single_line_model_references_normalize_and_independent_validator_agrees(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, e = deploy(direct_vm, direct_deploy, direct_alice)
    old._submit(direct_vm, c, direct_bob, e)
    old._warp_to(direct_vm, DEADLINE + 1)
    raw = judgment(direct_vm, mutate=lambda raw: [row.update(refs=[{"source": "original", "line": 1}]) for row in raw["criteria"]])
    c.evaluate_submission(e, 0)
    assert direct_vm.run_validator()
    ref = c.get_scorecard_history(e, 0)["current"]["decision"]["criteria"][0]["refs"][0]
    assert ref["start"] == ref["end"] == 1 and "line" not in ref
    assert raw["criteria"][0]["refs"][0]["line"] == 1


def test_invalid_reference_gets_one_independently_repeated_repair_attempt(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, e = deploy(direct_vm, direct_deploy, direct_alice)
    old._submit(direct_vm, c, direct_bob, e)
    old._warp_to(direct_vm, DEADLINE + 1)
    valid = judgment(direct_vm, mutate=lambda raw: [row.update(refs=[{"source": "original", "line": 1}]) for row in raw["criteria"]])
    invalid = copy.deepcopy(valid)
    invalid["criteria"][0]["refs"] = [{"source": "original", "line": 999}]
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r"(?s)^(?!.*SCHEMA_REPAIR:).*independent hackathon jury.*", json.dumps(invalid))
    direct_vm.mock_llm(r"(?s).*SCHEMA_REPAIR:.*", json.dumps(valid))
    c.evaluate_submission(e, 0)
    assert direct_vm.run_validator()
    assert c.get_submission(e, 0)["score_total_bps"] == "7400"


def test_failed_repair_never_changes_a_pending_appeal(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, e = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    before = c.get_scorecard_history(e, 0)
    direct_vm.sender = direct_bob
    c.appeal_submission(e, 0, STATEMENT, "", "execution")
    judgment(direct_vm, (100,), target="execution", mutate=lambda raw: raw["criteria"][0].update(refs=[{"source": "original", "line": 999}]))
    with pytest.raises(Exception, match="LLM_ERROR"):
        c.resolve_appeal(e, 0)
    after = c.get_scorecard_history(e, 0)
    assert after["effective_status"] == "APPEAL_PENDING"
    assert after["original"] == before["original"] and after["current"] == before["current"]
    assert c.get_config()["max_scorecard_prompt_attempts"] == "2"


@pytest.mark.parametrize("mutate", [
    lambda x: x.clear(), lambda x: x.pop(), lambda x: x.extend(copy.deepcopy(x) * 2),
    lambda x: x[0].update(weight=69), lambda x: x[0].update(weight=True),
    lambda x: x[0].update(weight=70.0), lambda x: x[0].update(weight=0),
    lambda x: x[0].update(id="clarity"), lambda x: x[0].update(id="eligibility"),
    lambda x: x[0].update(id="Bad ID"), lambda x: x[0].update(extra="ignored"),
    lambda x: x[0].update(description="short"), lambda x: x[0].update(name=23),
])
def test_invalid_rubrics_rejected(direct_vm, direct_deploy, direct_alice, mutate):
    criteria = copy.deepcopy(CRITERIA)
    mutate(criteria)
    with pytest.raises(Exception, match="EXPECTED"):
        deploy(direct_vm, direct_deploy, direct_alice, criteria)


@pytest.mark.parametrize("mutate", [
    lambda x: x["criteria"][0].update(score=75), lambda x: x["criteria"][0].update(score="80"),
    lambda x: x["criteria"][0].update(score=True), lambda x: x["criteria"][0].update(refs=[]),
    lambda x: x["criteria"][0]["refs"][0].update(start=0),
    lambda x: x["criteria"][0]["refs"][0].update(end=999),
    lambda x: x["criteria"][0]["refs"][0].update(source="appeal"),
    lambda x: x["criteria"][0]["refs"][0].update(source="web"),
    lambda x: x["criteria"][0]["refs"][0].update(excerpt="invented quote"),
    lambda x: x["criteria"][0].update(id="clarity"), lambda x: x["criteria"].pop(),
    lambda x: x.update(score_total_bps=10000), lambda x: x.update(confidence=True),
    lambda x: x["criteria"][0].update(reason=""),
])
def test_invalid_jury_outputs_fail_closed(direct_vm, direct_deploy, direct_alice, direct_bob, mutate):
    c, e = deploy(direct_vm, direct_deploy, direct_alice)
    old._submit(direct_vm, c, direct_bob, e)
    old._warp_to(direct_vm, DEADLINE + 1)
    judgment(direct_vm, mutate=mutate)
    with pytest.raises(Exception, match="LLM_ERROR"):
        c.evaluate_submission(e, 0)
    assert c.get_submission(e, 0)["status"] == "SUBMITTED"
    assert c.get_scorecard_history(e, 0)["original"] is None


def test_common_window_waits_for_last_initial_judgment(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, e = deploy(direct_vm, direct_deploy, direct_alice)
    old._submit(direct_vm, c, direct_bob, e)
    old._submit(direct_vm, c, direct_charlie, e, "two")
    old._warp_to(direct_vm, DEADLINE + 1)
    judgment(direct_vm)
    c.evaluate_submission(e, 0)
    assert c.get_submission(e, 0)["appealable"] is False
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="after all initial judgments"):
        c.appeal_submission(e, 0, STATEMENT, "", "execution")
    old._warp_to(direct_vm, DEADLINE + 500)
    c.evaluate_submission(e, 1)
    assert c.get_hackathon(e)["common_appeal_deadline_unix"] == str(DEADLINE + 500 + WINDOW)
    assert c.get_submission(e, 0)["appeal_deadline_unix"] == c.get_submission(e, 1)["appeal_deadline_unix"]


def test_eligible_criterion_appeal_preserves_other_scores_and_history(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, e = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    before = c.get_scorecard_history(e, 0)
    direct_vm.sender = direct_bob
    c.appeal_submission(e, 0, STATEMENT, "", "execution")
    judgment(direct_vm, (100,), target="execution")
    c.resolve_appeal(e, 0)
    after = c.get_scorecard_history(e, 0)
    assert after["original"] == before["original"]
    assert after["original_digest"] == before["original_digest"]
    assert after["current_digest"] != before["current_digest"]
    assert after["current"]["parent_scorecard_digest"] == before["original_digest"]
    assert after["current"]["decision"]["criteria"][1] == before["original"]["decision"]["criteria"][1]
    assert after["current"]["decision"]["score_total_bps"] == 8800
    assert c.get_submission(e, 0)["appealable"] is False
    with pytest.raises(Exception, match="appeal limit"):
        c.appeal_submission(e, 0, STATEMENT, "", "clarity")
    with pytest.raises(Exception, match="window"):
        c.finalize_hackathon(e)
    close_window(direct_vm, c, e)
    c.finalize_hackathon(e)
    assert c.get_hackathon(e)["status"] == "FINALIZED"


@pytest.mark.parametrize("target", ["eligibility", "nonexistent", ""])
def test_eligible_appeal_requires_valid_criterion(direct_vm, direct_deploy, direct_alice, direct_bob, target):
    c, e = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="valid criterion"):
        c.appeal_submission(e, 0, STATEMENT, "", target)


def test_appeal_permissions_and_exact_deadline(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, e = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="only the entrant"):
        c.appeal_submission(e, 0, STATEMENT, "", "execution")
    direct_vm.sender = direct_bob
    close_window(direct_vm, c, e)
    with pytest.raises(Exception, match="window has closed"):
        c.appeal_submission(e, 0, STATEMENT, "", "execution")


def test_eligibility_appeal_can_reassess_all_criteria(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, e = ready(direct_vm, direct_deploy, direct_alice, direct_bob, label="INCONCLUSIVE")
    assert c.get_submission(e, 0)["score_total_bps"] == "0"
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="appeal eligibility"):
        c.appeal_submission(e, 0, STATEMENT, "", "execution")
    c.appeal_submission(e, 0, STATEMENT, "", "eligibility")
    judgment(direct_vm, (80, 80))
    c.resolve_appeal(e, 0)
    assert c.get_submission(e, 0)["score_total_bps"] == "8000"


def test_new_appeal_evidence_uses_wallet_and_parent_proof(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, e = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    parent = c.get_submission(e, 0)["evidence_package_digest"]
    url = old._mock_repository(direct_vm, c, direct_bob, e, "addendum", parent)
    direct_vm.sender = direct_bob
    c.appeal_submission(e, 0, STATEMENT, url, "execution")
    judgment(direct_vm, (100,), target="execution", ref_source="appeal")
    c.resolve_appeal(e, 0)
    history = c.get_scorecard_history(e, 0)
    assert history["current"]["decision"]["criteria"][0]["refs"][0]["source"] == "appeal"
    assert history["current"]["appeal_package_digest"] == c.get_submission(e, 0)["appeal_package_digest"]
    close_window(direct_vm, c, e)
    c.finalize_hackathon(e)


def test_score_appeal_can_reduce_score_and_change_winner(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, e = deploy(direct_vm, direct_deploy, direct_alice, prize=old.PRIZE)
    old._submit(direct_vm, c, direct_bob, e)
    old._submit(direct_vm, c, direct_charlie, e, "two")
    old._warp_to(direct_vm, DEADLINE + 1)
    judgment(direct_vm, (100, 100))
    c.evaluate_submission(e, 0)
    judgment(direct_vm, (80, 80))
    c.evaluate_submission(e, 1)
    direct_vm.sender = direct_bob
    c.appeal_submission(e, 0, STATEMENT, "", "execution")
    judgment(direct_vm, (40,), target="execution")
    c.resolve_appeal(e, 0)
    h = c.get_scorecard_history(e, 0)
    assert h["original_rank"] == "1" and h["current_rank"] == "2"
    close_window(direct_vm, c, e)
    c.finalize_hackathon(e)
    assert c.get_hackathon(e)["winner"].lower() == old._address(direct_charlie)
    assert c.get_credit(old._address(direct_charlie)) == str(old.PRIZE)
    direct_vm.sender = direct_charlie
    c.withdraw_credit()
    assert c.get_credit(old._address(direct_charlie)) == "0"


def test_exact_weighted_total_is_not_rounded_into_eligibility(direct_vm, direct_deploy, direct_alice, direct_bob):
    criteria = copy.deepcopy(CRITERIA)
    criteria[0]["weight"], criteria[1]["weight"] = 51, 49
    c, e = deploy(direct_vm, direct_deploy, direct_alice, criteria, minimum=70)
    old._submit(direct_vm, c, direct_bob, e)
    old._warp_to(direct_vm, DEADLINE + 1)
    judgment(direct_vm, (60, 80))
    c.evaluate_submission(e, 0)
    assert c.get_submission(e, 0)["score_total_bps"] == "6980"
    close_window(direct_vm, c, e)
    c.finalize_hackathon(e)
    assert c.get_hackathon(e)["status"] == "NO_WINNER"


def test_pending_appeal_blocks_then_times_out_without_invented_score(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, e = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    c.appeal_submission(e, 0, STATEMENT, "", "execution")
    close_window(direct_vm, c, e)
    with pytest.raises(Exception, match="appeal is pending"):
        c.finalize_hackathon(e)
    old._warp_to(direct_vm, int(c.get_submission(e, 0)["resolution_deadline_unix"]) + 1)
    c.expire_unresolved_submission(e, 0)
    h = c.get_scorecard_history(e, 0)
    assert h["judgment_timed_out"] and h["effective_total_bps"] == "0"
    assert h["original"] == h["current"]  # preserved historical result, not the effective timeout
    assert c.get_submission(e, 0)["appealable"] is False
    c.finalize_hackathon(e)
    assert c.get_hackathon(e)["status"] == "NO_WINNER"


def test_initial_timeout_opens_remaining_entries_common_window(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, e = deploy(direct_vm, direct_deploy, direct_alice)
    old._submit(direct_vm, c, direct_bob, e)
    old._submit(direct_vm, c, direct_charlie, e, "two")
    old._warp_to(direct_vm, DEADLINE + 1)
    judgment(direct_vm)
    c.evaluate_submission(e, 0)
    old._warp_to(direct_vm, DEADLINE + old.JUDGMENT_TIMEOUT + 1)
    c.expire_unresolved_submission(e, 1)
    assert c.get_submission(e, 0)["appealable"] is True
    assert c.get_submission(e, 1)["appealable"] is False
    close_window(direct_vm, c, e)
    c.finalize_hackathon(e)


def test_validator_comparison_ignores_wording_but_not_decisions_or_invalid_refs(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, e = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    honest = c.get_scorecard_history(e, 0)["current"]["decision"]
    snapshots = {"original": c.get_submission_evidence(e, 0)["evidence_snapshot"], "appeal": ""}
    changed = copy.deepcopy(honest)
    changed["reason"] = "A differently worded valid explanation."
    changed["criteria"][0]["reason"] = "Another explanation of the same score."
    assert c._evaluation_results_match(honest, changed, CRITERIA, snapshots)
    changed["criteria"][0]["score_band"] = 100
    changed["score_total_bps"] = 8800
    assert not c._evaluation_results_match(honest, changed, CRITERIA, snapshots)
    changed = copy.deepcopy(honest)
    changed["criteria"][0]["refs"][0]["excerpt"] = "Fabricated evidence."
    assert not c._evaluation_results_match(honest, changed, CRITERIA, snapshots)
    assert not c._evaluation_results_match(honest, {**honest, "confidence_bucket": 50}, CRITERIA, snapshots)


@pytest.mark.parametrize("field,value", [("current_scorecard_digest", "f" * 64), ("original_scorecard_digest", "f" * 64), ("score_total_bps", 10000), ("current_scorecard", "{}")])
def test_settlement_rejects_corrupt_scorecard_state(direct_vm, direct_deploy, direct_alice, direct_bob, field, value):
    c, e = ready(direct_vm, direct_deploy, direct_alice, direct_bob, prize=old.PRIZE)
    entry = c._get_submission(e, 0)
    setattr(entry, field, value)
    c.submissions[e + ":0"] = entry
    close_window(direct_vm, c, e)
    with pytest.raises(Exception, match="scorecard integrity"):
        c.finalize_hackathon(e)
    assert c.get_credit(old._address(direct_bob)) == "0"
    assert c.get_hackathon(e)["prize_released"] is False
