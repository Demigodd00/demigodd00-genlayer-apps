import copy
import hashlib
import json
from datetime import datetime, timezone
import pytest

NOW = 2_000_000_000
BUDGET = 10**15 + 3
ROWS = [
    {"title": "Website mention", "requirement": "Publish a sentence naming Nova as the primary sponsor of the workshop.", "url": "https://example.com/sponsor", "weight": 60},
    {"title": "Newsletter mention", "requirement": "Publish a newsletter paragraph naming Nova and explaining its developer toolkit.", "url": "https://example.com/newsletter", "weight": 40},
]

def addr(value):
    return "0x" + bytes(value).hex()

def warp(vm, n):
    vm.warp(datetime.fromtimestamp(n, timezone.utc).isoformat())

def setup(vm, deploy, sponsor, organizer, rows=None):
    c = deploy("contracts/sponsorproof.py")
    vm.sender = sponsor
    cid = c.propose("Nova developer workshop", addr(organizer), json.dumps(ROWS if rows is None else rows), BUDGET, NOW + 600, 60)
    return c, cid

def fund(vm, c, cid, sponsor, organizer):
    vm.sender = organizer
    c.accept(cid, c.get_campaign(cid)["terms_digest"])
    vm.sender = sponsor
    vm.value = BUDGET
    c.fund(cid)
    vm.value = 0

def capture(vm, c, cid, organizer, index=0, body=None):
    vm.sender = organizer
    row = ROWS[index]
    challenge = c.get_challenge(cid, "c" + str(index + 1))
    text = body if body is not None else "Nova is the primary sponsor of this workshop.\nNova builds a developer toolkit.\n" + challenge
    vm.mock_web(row["url"], {"status": 200, "body": text})
    c.capture(cid, "c" + str(index + 1))
    return text

def judge(vm, outcomes=("FULFILLED", "PARTIAL"), mutate=None):
    raw = {"commitments": [{"id": "c" + str(i+1), "outcome": outcome, "reason": "The frozen page supports this classification.", "lines": [1]} for i, outcome in enumerate(outcomes)]}
    if mutate:
        mutate(raw)
    vm.mock_llm(r".*independent SponsorProof.*", json.dumps(raw))
    return raw

def ready(vm, deploy, sponsor, organizer, outcomes=("FULFILLED", "PARTIAL")):
    c, cid = setup(vm, deploy, sponsor, organizer)
    fund(vm, c, cid, sponsor, organizer)
    capture(vm, c, cid, organizer, 0)
    capture(vm, c, cid, organizer, 1)
    warp(vm, NOW + 601)
    judge(vm, outcomes)
    c.evaluate(cid)
    return c, cid

def test_full_lifecycle_conserves_every_atto(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    assert direct_vm.run_validator()
    before = c.get_campaign(cid)
    assert before["status"] == "REVIEW"
    warp(direct_vm, NOW + 662)
    c.settle(cid)
    row = c.get_campaign(cid)
    earned = BUDGET * 60 // 100 + (BUDGET - BUDGET * 60 // 100) // 2
    assert int(row["organizer_allocation"]) == earned
    assert int(row["sponsor_allocation"]) + earned == BUDGET
    assert row["status"] == "SETTLED" and row["held_atto"] == "0"
    assert row["history"] == before["history"]
    direct_vm.sender = direct_bob
    assert int(c.get_credit(addr(direct_bob))) == earned
    c.claim()
    assert c.get_credit(addr(direct_bob)) == "0"
    with pytest.raises(Exception, match="no credit"):
        c.claim()
    with pytest.raises(Exception, match="settlement"):
        c.settle(cid)

@pytest.mark.parametrize("mutate", [
    lambda r:r.clear(), lambda r:r[0].update(weight=55), lambda r:r[0].update(weight=True),
    lambda r:r[0].update(weight=60.0), lambda r:r[0].update(requirement="short"),
    lambda r:r[0].update(extra="bad"), lambda r:r[0].update(url="http://example.com"),
    lambda r:r[0].update(url="https://127.0.0.1/x"), lambda r:r[0].update(url="https://localhost/x"),
    lambda r:r[0].update(url="https://example.com:443/x"), lambda r:r[0].update(url="https://a@b.com/x"),
    lambda r:r[0].update(url="https://metadata.internal/x"), lambda r:r.extend(copy.deepcopy(r)*2),
])
def test_invalid_agreements(direct_vm, direct_deploy, direct_alice, direct_bob, mutate):
    rows=copy.deepcopy(ROWS); mutate(rows)
    with pytest.raises(Exception, match="EXPECTED"):
        setup(direct_vm, direct_deploy, direct_alice, direct_bob, rows)

def test_acceptance_and_exact_funding(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    vm=direct_vm; c,cid=setup(vm,direct_deploy,direct_alice,direct_bob)
    vm.value=BUDGET
    with pytest.raises(Exception, match="accepted"):
        c.fund(cid)
    vm.value=0; vm.sender=direct_charlie
    with pytest.raises(Exception, match="two agreement parties"):
        c.accept(cid,c.get_campaign(cid)["terms_digest"])
    vm.sender=direct_bob
    with pytest.raises(Exception, match="digest"):
        c.accept(cid,"wrong")
    c.accept(cid,c.get_campaign(cid)["terms_digest"])
    vm.sender=direct_alice; vm.value=BUDGET-1
    with pytest.raises(Exception, match="exact"):
        c.fund(cid)
    vm.value=BUDGET; c.fund(cid); vm.value=0
    with pytest.raises(Exception, match="unfunded"):
        c.cancel_unfunded(cid)

def test_capture_binding_and_early_seals(direct_vm,direct_deploy,direct_alice,direct_bob):
    vm=direct_vm; c,cid=setup(vm,direct_deploy,direct_alice,direct_bob); fund(vm,c,cid,direct_alice,direct_bob)
    with pytest.raises(Exception, match="every commitment"):
        c.seal_evidence(cid)
    with pytest.raises(Exception, match="challenge"):
        capture(vm,c,cid,direct_bob,body="Forged publication text without a wallet challenge.")
    vm.clear_mocks(); original=capture(vm,c,cid,direct_bob)
    ev=c.get_campaign(cid)["evidence"]["c1"]
    assert ev["sha256"]==hashlib.sha256(original.encode()).hexdigest()
    with pytest.raises(Exception, match="already captured"):
        capture(vm,c,cid,direct_bob)
    capture(vm,c,cid,direct_bob,1)
    c.seal_evidence(cid); vm.sender=direct_alice; c.seal_evidence(cid)
    judge(vm); c.evaluate(cid)
    assert c.get_campaign(cid)["status"]=="REVIEW"

@pytest.mark.parametrize("mutate", [
    lambda r:r["commitments"][0].update(outcome="YES"), lambda r:r["commitments"][0].update(lines=[]),
    lambda r:r["commitments"][0].update(lines=[0]), lambda r:r["commitments"][0].update(lines=[999]),
    lambda r:r["commitments"][0].update(lines=[True]), lambda r:r["commitments"][0].update(id="c99"),
    lambda r:r["commitments"].pop(), lambda r:r.update(payment=100), lambda r:r["commitments"][0].update(reason=""),
])
def test_invalid_model_outputs_fail_closed(direct_vm,direct_deploy,direct_alice,direct_bob,mutate):
    vm=direct_vm; c,cid=setup(vm,direct_deploy,direct_alice,direct_bob); fund(vm,c,cid,direct_alice,direct_bob)
    capture(vm,c,cid,direct_bob); capture(vm,c,cid,direct_bob,1); warp(vm,NOW+601)
    judge(vm,mutate=mutate)
    with pytest.raises(Exception, match="LLM_ERROR"):
        c.evaluate(cid)
    assert c.get_campaign(cid)["history"]==[]

def test_validator_checks_substance_not_prose(direct_vm,direct_deploy,direct_alice,direct_bob):
    vm=direct_vm; c,cid=ready(vm,direct_deploy,direct_alice,direct_bob)
    vm.clear_mocks(); judge(vm,mutate=lambda r:r["commitments"][0].update(reason="A different valid explanation supported by the same evidence."))
    assert vm.run_validator()
    vm.clear_mocks(); judge(vm,("NOT_FULFILLED","PARTIAL"))
    assert not vm.run_validator()

def test_appeal_preserves_history_and_waits_for_both_parties(direct_vm,direct_deploy,direct_alice,direct_bob):
    vm=direct_vm; c,cid=ready(vm,direct_deploy,direct_alice,direct_bob)
    original=c.get_campaign(cid)["history"][0]
    vm.sender=direct_bob; c.appeal(cid,"Please reassess the newsletter paragraph against the full requirement.")
    with pytest.raises(Exception, match="one appeal"):
        c.appeal(cid,"Another statement that must be rejected as a duplicate.")
    with pytest.raises(Exception, match="closed review"):
        c.resolve_appeal(cid)
    vm.sender=direct_alice; c.appeal(cid,"The submitted paragraph is missing some material details from the agreement.")
    warp(vm,NOW+662)
    with pytest.raises(Exception, match="pending appeal"):
        c.settle(cid)
    vm.clear_mocks(); judge(vm,("FULFILLED","FULFILLED")); c.resolve_appeal(cid)
    assert vm.run_validator()
    state=c.get_campaign(cid)
    assert state["history"][0]==original and state["history"][1]["parent_digest"]==original["digest"]
    c.settle(cid)
    assert c.get_campaign(cid)["organizer_allocation"]==str(BUDGET)

def test_inconclusive_hold_requires_counterparty_split(direct_vm,direct_deploy,direct_alice,direct_bob):
    vm=direct_vm; c,cid=ready(vm,direct_deploy,direct_alice,direct_bob,("FULFILLED","INCONCLUSIVE"))
    warp(vm,NOW+662); c.settle(cid)
    state=c.get_campaign(cid); held=int(state["held_atto"])
    assert state["status"]=="HELD" and held>0
    vm.sender=direct_bob; digest=c.propose_split(cid,held//3)
    with pytest.raises(Exception,match="counterparty"):
        c.accept_split(cid,digest)
    vm.sender=direct_alice
    with pytest.raises(Exception,match="digest"):
        c.accept_split(cid,"stale")
    c.accept_split(cid,digest)
    state=c.get_campaign(cid)
    assert state["status"]=="SETTLED"
    assert int(state["organizer_allocation"])+int(state["sponsor_allocation"])==BUDGET

@pytest.mark.parametrize("mode", ["no_capture","appeal_pending","held"])
def test_timeout_refunds_only_unresolved(direct_vm,direct_deploy,direct_alice,direct_bob,mode):
    vm=direct_vm
    if mode=="no_capture":
        c,cid=setup(vm,direct_deploy,direct_alice,direct_bob); fund(vm,c,cid,direct_alice,direct_bob)
    else:
        c,cid=ready(vm,direct_deploy,direct_alice,direct_bob,("FULFILLED","INCONCLUSIVE"))
        if mode=="appeal_pending":
            c.appeal(cid,"Please reassess this evidence before the common review period ends.")
        else:
            warp(vm,NOW+662); c.settle(cid)
    with pytest.raises(Exception,match="timeout"):
        c.expire(cid)
    warp(vm,NOW+600+7*86400); c.expire(cid)
    state=c.get_campaign(cid)
    assert state["status"]=="TIMEOUT_REFUND" and state["held_atto"]=="0"
    assert int(state["sponsor_allocation"])+int(state["organizer_allocation"])==BUDGET
    with pytest.raises(Exception,match="timeout"):
        c.expire(cid)

def test_missing_evidence_is_not_non_delivery(direct_vm,direct_deploy,direct_alice,direct_bob):
    vm=direct_vm; c,cid=setup(vm,direct_deploy,direct_alice,direct_bob); fund(vm,c,cid,direct_alice,direct_bob)
    warp(vm,NOW+601); c.evaluate(cid)
    assert all(x["outcome"]=="INCONCLUSIVE" for x in c.get_campaign(cid)["history"][0]["decision"]["commitments"])
    warp(vm,NOW+662); c.settle(cid)
    assert c.get_campaign(cid)["held_atto"]==str(BUDGET)
