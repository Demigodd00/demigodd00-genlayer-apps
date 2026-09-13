"""Lacuna protocol tests: independent validator replay is explicit."""
import hashlib
import json
import sys
from datetime import datetime, timezone

import pytest

NOW = 2_000_000_000
BOUNTY = 10**16
STAKE = BOUNTY // 10
RULE = "Approve applicants only if both independent pilot reviews finished before June 15 of the same year."
DOCUMENT = "Both independent pilot reviews for the applicant finished in June of that year."
A = "Both reviews finished on June 10 of that same year."
B = "Both reviews finished on June 20 of that same year."
SALT = "a3" * 32
VALID = {"a_compatible": True, "b_compatible": True, "same_subject": True,
         "policy_respected": True, "a_outcome": "APPROVE", "b_outcome": "REJECT",
         "basis": "Both dates fit June; they lie on opposite sides of June 15."}


def addr(value):
    raw = value.as_bytes if hasattr(value, "as_bytes") else value
    return "0x" + raw.hex() if isinstance(raw, bytes) else str(value)


def warp(vm, unix):
    value = datetime.fromtimestamp(unix, timezone.utc).isoformat()
    vm.warp(value)
    module = sys.modules.get("_contract_lacuna")
    if module:
        module.gl.message_raw["datetime"] = value


@pytest.fixture(autouse=True)
def clock(direct_vm):
    warp(direct_vm, NOW)


def capture(vm):
    transfers, messages = [], []
    def hook(_vm, request):
        if "EthSend" in request:
            transfers.append(request["EthSend"])
            return {"ok": None}
        if "PostMessage" in request:
            messages.append(request["PostMessage"])
            return {"ok": None}
        return None
    vm._gl_call_hook = hook
    return transfers, messages


def mock(vm, data):
    vm.clear_mocks()
    vm.mock_llm(r"(?s).*", json.dumps(data))


def campaign(vm, contract, sponsor, *, profile="STANDARD", ready=True, **changes):
    vm.sender, vm.value = sponsor, changes.get("amount", BOUNTY)
    try:
        campaign_id = contract.create_campaign(changes.get("title", "June eligibility"),
            changes.get("rule", RULE), profile, changes.get("closes", NOW + 3600))
    finally:
        vm.value = 0
    if ready:
        vm.sender = vm._contract_address
        mock(vm, {"admissible": True, "basis": "Bounded eligibility criteria."})
        contract.validate_rule(campaign_id)
        assert vm.run_validator() is True
    return campaign_id


def commitment(vm, campaign_id, actor, document=DOCUMENT, a=A, b=B, salt=SALT, **changes):
    data = ["lacuna-v1", changes.get("network", "61999"),
            changes.get("contract", addr(vm._contract_address).lower()),
            changes.get("campaign", campaign_id), changes.get("challenger", addr(actor).lower()),
            document, a, b, salt]
    return hashlib.sha256(json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()).hexdigest()


def commit(vm, contract, campaign_id, challenger, *, digest=None, stake=STAKE):
    vm.sender, vm.value = challenger, stake
    try:
        return contract.commit_attempt(campaign_id, digest or commitment(vm, campaign_id, challenger))
    finally:
        vm.value = 0


def start(vm, contract, sponsor, challenger, *, profile="STANDARD", document=DOCUMENT, a=A, b=B):
    campaign_id = campaign(vm, contract, sponsor, profile=profile)
    digest = commitment(vm, campaign_id, challenger, document, a, b)
    attempt_id = commit(vm, contract, campaign_id, challenger, digest=digest)
    contract.reveal_attempt(attempt_id, document, a, b, SALT)
    return campaign_id, attempt_id


def stage(vm, contract, attempt_id, name, response):
    vm.sender = vm._contract_address
    mock(vm, response)
    contract.evaluate_stage(attempt_id, name)


def finish(vm, contract, attempt_id, *, target="INSUFFICIENT_EVIDENCE", first=None, second=None):
    stage(vm, contract, attempt_id, "TARGET_PENDING", {"verdict": target, "basis": "target-only-basis"})
    assert vm.run_validator() is True
    stage(vm, contract, attempt_id, "REFEREE_ONE_PENDING", first or VALID)
    assert vm.run_validator() is True
    stage(vm, contract, attempt_id, "REFEREE_TWO_PENDING", second or first or VALID)
    assert vm.run_validator() is True
    return contract.get_attempt(attempt_id)


@pytest.mark.parametrize("profile", ["STANDARD", "SEEDED_PERMISSIVE"])
def test_campaign_is_funded_immutable_and_validated(profile, direct_vm, direct_deploy, direct_alice):
    _, messages = capture(direct_vm)
    contract = direct_deploy("contracts/lacuna.py")
    cid = campaign(direct_vm, contract, direct_alice, profile=profile)
    result = contract.get_campaign(cid)
    assert result["rule"] == RULE and result["rule_sha256"] == hashlib.sha256(RULE.encode()).hexdigest()
    assert result["status"] == "OPEN" and result["stake_atto"] == str(STAKE)
    assert result["seeded_control"] == (profile == "SEEDED_PERMISSIVE")
    assert messages[0]["on"] == "finalized"
    assert contract.get_stats()["accounting_balanced"]


@pytest.mark.parametrize(("change", "error"), [
    ({"title": ""}, "title"), ({"title": "x"*81}, "title"), ({"title": "  "}, "blank"),
    ({"rule": "short"}, "rule"), ({"rule": "x"*2401}, "rule"),
    ({"amount": 0}, "bounty"), ({"amount": 11*10**18}, "bounty"),
    ({"closes": NOW+1799}, "closing time"), ({"closes": NOW+8*86400}, "closing time"),
])
def test_reject_invalid_campaign(change, error, direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/lacuna.py")
    with pytest.raises(Exception, match=error):
        campaign(direct_vm, contract, direct_alice, ready=False, **change)


def test_invalid_profile(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/lacuna.py")
    with pytest.raises(Exception, match="profile"):
        campaign(direct_vm, contract, direct_alice, profile="SECRET_ADMIN")


def test_invalid_rule_refunds_only_sponsor(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/lacuna.py")
    cid = campaign(direct_vm, contract, direct_alice, ready=False)
    direct_vm.sender = direct_vm._contract_address
    mock(direct_vm, {"admissible": False, "basis": "Policy is contradictory."})
    contract.validate_rule(cid)
    assert contract.get_campaign(cid)["status"] == "INVALID_RULE"
    assert contract.get_credit(addr(direct_alice)) == str(BOUNTY)
    assert contract.get_stats()["accounting_balanced"]


@pytest.mark.parametrize("who", ["alice", "bob", "charlie"])
def test_only_self_can_execute_rules_or_stages(who, direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/lacuna.py")
    cid = campaign(direct_vm, contract, direct_alice, ready=False)
    direct_vm.sender = {"alice":direct_alice, "bob":direct_bob, "charlie":direct_charlie}[who]
    with pytest.raises(Exception, match="only the contract"):
        contract.validate_rule(cid)
    with pytest.raises(Exception, match="only the contract"):
        contract.evaluate_stage("la-1", "TARGET_PENDING")


def test_only_open_campaigns_accept_stakes(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    cid = campaign(direct_vm, contract, direct_alice, ready=False)
    with pytest.raises(Exception, match="not open"):
        commit(direct_vm, contract, cid, direct_bob)


@pytest.mark.parametrize("stake", [0, STAKE-1, STAKE+1])
def test_stake_must_match_exactly(stake, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    cid = campaign(direct_vm, contract, direct_alice)
    with pytest.raises(Exception, match="exact"):
        commit(direct_vm, contract, cid, direct_bob, stake=stake)


def test_no_sponsor_self_attempt_or_parallel_commit(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/lacuna.py")
    cid = campaign(direct_vm, contract, direct_alice)
    with pytest.raises(Exception, match="different wallets"):
        commit(direct_vm, contract, cid, direct_alice)
    commit(direct_vm, contract, cid, direct_bob)
    with pytest.raises(Exception, match="another attempt"):
        commit(direct_vm, contract, cid, direct_charlie)


@pytest.mark.parametrize("changes", [{"network":"4221"}, {"contract":"0x"+"77"*20},
                                     {"campaign":"lc-99"}, {"challenger":"0x"+"66"*20}])
def test_commitment_is_bound_to_chain_contract_campaign_and_wallet(changes, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    cid = campaign(direct_vm, contract, direct_alice)
    aid = commit(direct_vm, contract, cid, direct_bob, digest=commitment(direct_vm, cid, direct_bob, **changes))
    with pytest.raises(Exception, match="bound commitment"):
        contract.reveal_attempt(aid, DOCUMENT, A, B, SALT)


def test_reveal_preserves_parent_before_any_llm(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    _, messages = capture(direct_vm)
    contract = direct_deploy("contracts/lacuna.py")
    cid = campaign(direct_vm, contract, direct_alice)
    aid = commit(direct_vm, contract, cid, direct_bob)
    direct_vm.sender = direct_charlie
    with pytest.raises(Exception, match="committed challenger"):
        contract.reveal_attempt(aid, DOCUMENT, A, B, SALT)
    direct_vm.sender = direct_bob
    contract.reveal_attempt(aid, DOCUMENT, A, B, SALT)
    result = contract.get_attempt(aid)
    assert result["target"] is None and result["status"] == "TARGET_PENDING"
    assert result["stage_deadline"] == str(NOW+900)
    assert messages[-1]["on"] == "finalized"


@pytest.mark.parametrize("name,value,error", [("document","x"*3001,"document"),
    ("a","x"*1201,"completion A"), ("b","\x00bad","completion B"),
    ("salt","bad","salt"), ("a",B,"differ")])
def test_reveal_bounds(name, value, error, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    cid = campaign(direct_vm, contract, direct_alice)
    aid = commit(direct_vm, contract, cid, direct_bob)
    values = {"document":DOCUMENT, "a":A, "b":B, "salt":SALT}
    values[name] = value
    with pytest.raises(Exception, match=error):
        contract.reveal_attempt(aid, values["document"], values["a"], values["b"], values["salt"])


@pytest.mark.parametrize(("profile", "counter"), [("STANDARD", "genuine_findings"), ("SEEDED_PERMISSIVE", "control_findings")])
def test_valid_finding_and_credit_conservation(profile, counter, direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    transfers, _ = capture(direct_vm)
    contract = direct_deploy("contracts/lacuna.py")
    cid, aid = start(direct_vm, contract, direct_alice, direct_bob, profile=profile)
    result = finish(direct_vm, contract, aid, target="APPROVE")
    assert result["status"] == "CONFIRMED_FINDING"
    assert contract.get_credit(addr(direct_bob)) == str(BOUNTY+STAKE)
    assert contract.get_credit(addr(direct_alice)) == "0"
    assert contract.get_campaign(cid)["status"] == "CLAIMED"
    assert contract.get_stats()[counter] == "1"
    direct_vm.sender = direct_charlie  # A helper cannot redirect someone else's credit.
    contract.withdraw_credit(addr(direct_bob))
    assert len(transfers) == 1 and int(transfers[0]["value"]) == BOUNTY+STAKE
    assert str(transfers[0]["address"]).lower() == addr(direct_bob).lower()
    with pytest.raises(Exception, match="no credit"):
        contract.withdraw_credit(addr(direct_bob))
    assert contract.get_stats()["accounting_balanced"]


def test_correct_abstention_is_not_finding(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    cid, aid = start(direct_vm, contract, direct_alice, direct_bob)
    assert finish(direct_vm, contract, aid)["status"] == "NO_FINDING"
    assert contract.get_credit(addr(direct_alice)) == str(STAKE)
    assert contract.get_credit(addr(direct_bob)) == "0"
    assert contract.get_campaign(cid)["remaining_bounty_atto"] == str(BOUNTY)


@pytest.mark.parametrize("field,value", [("a_compatible",False), ("b_compatible",False),
    ("same_subject",False), ("policy_respected",False), ("b_outcome","APPROVE"),
    ("a_outcome","INSUFFICIENT_EVIDENCE")])
def test_invalid_witnesses_cannot_win(field, value, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    _, aid = start(direct_vm, contract, direct_alice, direct_bob)
    result = finish(direct_vm, contract, aid, target="APPROVE", first={**VALID, field:value})
    assert result["status"] == "INVALID_ATTEMPT"
    assert contract.get_credit(addr(direct_bob)) == "0"
    assert contract.get_stats()["genuine_findings"] == "0"


@pytest.mark.parametrize("field,value", [("a_compatible",False), ("b_compatible",False),
    ("same_subject",False), ("policy_respected",False), ("a_outcome","REJECT"),
    ("b_outcome","APPROVE")])
def test_referee_disagreement_refunds_stake_without_bounty(field, value, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    cid, aid = start(direct_vm, contract, direct_alice, direct_bob)
    result = finish(direct_vm, contract, aid, target="APPROVE", second={**VALID, field:value})
    assert result["status"] == "INCONCLUSIVE"
    assert contract.get_credit(addr(direct_bob)) == str(STAKE)
    assert contract.get_credit(addr(direct_alice)) == "0"
    assert contract.get_campaign(cid)["remaining_bounty_atto"] == str(BOUNTY)
    assert contract.get_stats()["accounting_balanced"]


def test_validator_does_not_trust_allowed_target_label(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    _, aid = start(direct_vm, contract, direct_alice, direct_bob)
    stage(direct_vm, contract, aid, "TARGET_PENDING", {"verdict":"APPROVE", "basis":"Leader decides."})
    mock(direct_vm, {"verdict":"INSUFFICIENT_EVIDENCE", "basis":"Validator finds missing timing."})
    assert direct_vm.run_validator() is False


@pytest.mark.parametrize("field,value", [("a_compatible",False), ("b_compatible",False),
    ("same_subject",False), ("policy_respected",False), ("a_outcome","REJECT"),
    ("b_outcome","APPROVE")])
def test_validator_replays_every_referee_decision_field(field, value, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    _, aid = start(direct_vm, contract, direct_alice, direct_bob)
    stage(direct_vm, contract, aid, "TARGET_PENDING", {"verdict":"APPROVE", "basis":"target"})
    stage(direct_vm, contract, aid, "REFEREE_ONE_PENDING", VALID)
    mock(direct_vm, {**VALID, field:value})
    assert direct_vm.run_validator() is False


@pytest.mark.parametrize("bad", [{"verdict":"MAYBE", "basis":"bad"},
    {"verdict":True, "basis":"bad"}, {"verdict":"APPROVE", "basis":""},
    {"verdict":"APPROVE", "basis":"x"*1201}, {}, []])
def test_bad_target_output_is_never_a_finding(bad, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    _, aid = start(direct_vm, contract, direct_alice, direct_bob)
    with pytest.raises(Exception, match="LLM_ERROR"):
        stage(direct_vm, contract, aid, "TARGET_PENDING", bad)
    assert contract.get_attempt(aid)["status"] == "TARGET_PENDING"


@pytest.mark.parametrize("bad", ["true", 1, None])
def test_referee_boolean_is_not_coerced(bad, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    _, aid = start(direct_vm, contract, direct_alice, direct_bob)
    stage(direct_vm, contract, aid, "TARGET_PENDING", {"verdict":"APPROVE", "basis":"target"})
    with pytest.raises(Exception, match="JSON boolean"):
        stage(direct_vm, contract, aid, "REFEREE_ONE_PENDING", {**VALID, "a_compatible":bad})


def test_target_and_referees_are_blinded(monkeypatch, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    _, aid = start(direct_vm, contract, direct_alice, direct_bob, a=A+" WITNESS_A_SENTINEL", b=B+" WITNESS_B_SENTINEL")
    module = sys.modules["_contract_lacuna"]
    original = module.gl.nondet.exec_prompt
    prompts = []
    def intercept(prompt, **kwargs):
        prompts.append(prompt)
        return original(prompt, **kwargs)
    monkeypatch.setattr(module.gl.nondet, "exec_prompt", intercept)
    finish(direct_vm, contract, aid, target="APPROVE")
    target_prompts = [p for p in prompts if "LACUNA_TARGET_STANDARD_V1" in p]
    referee_prompts = [p for p in prompts if "LACUNA_REFEREE_" in p]
    assert target_prompts and referee_prompts
    assert all("WITNESS_A_SENTINEL" not in p and "WITNESS_B_SENTINEL" not in p for p in target_prompts)
    assert all("target-only-basis" not in p for p in referee_prompts)
    assert any("LACUNA_REFEREE_ONE_V1" in p for p in referee_prompts)
    assert any("LACUNA_REFEREE_TWO_V1" in p for p in referee_prompts)


@pytest.mark.parametrize("completed", [0, 1, 2])
def test_stalled_child_preserves_attempt_and_recovers(completed, direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/lacuna.py")
    cid, aid = start(direct_vm, contract, direct_alice, direct_bob)
    if completed >= 1:
        stage(direct_vm, contract, aid, "TARGET_PENDING", {"verdict":"APPROVE", "basis":"target"})
    if completed >= 2:
        stage(direct_vm, contract, aid, "REFEREE_ONE_PENDING", VALID)
    pending = contract.get_attempt(aid)["status"]
    direct_vm.sender = direct_charlie
    warp(direct_vm, NOW+899)
    with pytest.raises(Exception, match="deadline"):
        contract.expire_attempt(aid)
    warp(direct_vm, NOW+900)
    contract.expire_attempt(aid)
    result = contract.get_attempt(aid)
    assert result["status"] == "INCONCLUSIVE" and result["result_reason"] == "STAGE_TIMEOUT"
    assert contract.get_credit(addr(direct_bob)) == str(STAKE)
    assert contract.get_credit(addr(direct_alice)) == "0"
    with pytest.raises(Exception, match="not pending"):
        stage(direct_vm, contract, aid, pending, VALID)
    assert contract.get_campaign(cid)["active_attempt"] == ""


def test_validator_rejection_child_rollback_does_not_erase_reveal(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    _, aid = start(direct_vm, contract, direct_alice, direct_bob)
    before = direct_vm.snapshot()
    stage(direct_vm, contract, aid, "TARGET_PENDING", {"verdict":"APPROVE", "basis":"leader"})
    mock(direct_vm, {"verdict":"REJECT", "basis":"different independent result"})
    assert direct_vm.run_validator() is False
    direct_vm.revert(before)
    assert contract.get_attempt(aid)["status"] == "TARGET_PENDING"
    assert contract.get_attempt(aid)["document"] == DOCUMENT
    warp(direct_vm, NOW+900)
    contract.expire_attempt(aid)
    assert contract.get_credit(addr(direct_bob)) == str(STAKE)


def test_unrevealed_commitment_and_campaign_expiry(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    cid = campaign(direct_vm, contract, direct_alice)
    aid = commit(direct_vm, contract, cid, direct_bob)
    with pytest.raises(Exception, match="closing time"):
        contract.expire_campaign(cid)
    warp(direct_vm, NOW+900)
    with pytest.raises(Exception, match="not available"):
        contract.reveal_attempt(aid, DOCUMENT, A, B, SALT)
    contract.expire_attempt(aid)
    assert contract.get_attempt(aid)["status"] == "UNREVEALED"
    warp(direct_vm, NOW+3600)
    contract.expire_campaign(cid)
    assert contract.get_credit(addr(direct_alice)) == str(BOUNTY+STAKE)
    assert contract.get_stats()["accounting_balanced"]


def test_expiry_cannot_steal_active_attempt_bounty(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    cid, aid = start(direct_vm, contract, direct_alice, direct_bob)
    warp(direct_vm, NOW+3601)
    with pytest.raises(Exception, match="active attempt"):
        contract.expire_campaign(cid)
    contract.expire_attempt(aid)
    contract.expire_campaign(cid)
    assert contract.get_credit(addr(direct_bob)) == str(STAKE)
    assert contract.get_credit(addr(direct_alice)) == str(BOUNTY)


def test_rule_timeout_and_duplicate_close(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/lacuna.py")
    cid = campaign(direct_vm, contract, direct_alice, ready=False)
    warp(direct_vm, NOW+900)
    contract.expire_campaign(cid)
    assert contract.get_campaign(cid)["status"] == "RULE_INCONCLUSIVE"
    with pytest.raises(Exception, match="already closed"):
        contract.expire_campaign(cid)
    assert contract.get_credit(addr(direct_alice)) == str(BOUNTY)


def test_duplicate_and_out_of_order_stages_cannot_settle_twice(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    _, aid = start(direct_vm, contract, direct_alice, direct_bob)
    with pytest.raises(Exception, match="not pending"):
        stage(direct_vm, contract, aid, "REFEREE_TWO_PENDING", VALID)
    finish(direct_vm, contract, aid, target="APPROVE")
    with pytest.raises(Exception, match="not pending"):
        stage(direct_vm, contract, aid, "REFEREE_TWO_PENDING", VALID)
    with pytest.raises(Exception, match="already settled"):
        contract.expire_attempt(aid)
    assert contract.get_credit(addr(direct_bob)) == str(BOUNTY+STAKE)


def test_all_public_records_preserve_result_and_bound_pages(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    cid, aid = start(direct_vm, contract, direct_alice, direct_bob)
    finish(direct_vm, contract, aid)
    assert contract.list_campaigns(0,20)["total"] == "1"
    assert contract.list_attempts(cid)[0]["id"] == aid
    assert len(contract.list_attempts(cid)) == 1
    with pytest.raises(Exception, match="page size"):
        contract.list_campaigns(0,21)
    with pytest.raises(Exception, match="not found"):
        contract.get_attempt("bad")


def test_valid_case_cannot_be_retried_for_lucky_target_flip(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/lacuna.py")
    cid, aid = start(direct_vm, contract, direct_alice, direct_bob)
    finish(direct_vm, contract, aid)
    second = commit(direct_vm, contract, cid, direct_bob)
    with pytest.raises(Exception, match="already evaluated"):
        contract.reveal_attempt(second, DOCUMENT, A, B, SALT)
