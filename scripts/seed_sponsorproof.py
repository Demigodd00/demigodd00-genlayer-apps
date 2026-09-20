"""Controlled live consensus acceptance run. No web, LLM, vote or time overrides."""
import argparse
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus
from seed_hackathon_judge_demo import _load_signer
from hackathon_judge_rpc import read_studionet_view

ROOT=Path(__file__).resolve().parents[1]
RECORD=ROOT/"deployments/sponsorproof_demo.json"
BUDGET=10**15
BASE="https://raw.githubusercontent.com/Demigodd00/demigodd00-genlayer-apps/main/docs/evidence/sponsorproof/"
ROWS=[
 {"title":"Workshop website", "weight":50,"url":BASE+"website.txt",
  "requirement":"The workshop page must clearly identify Nova Tools as its headline sponsor and meaningfully explain that Nova Tools provides development tools for on-chain builders. Both elements are required for full delivery; a name alone is partial."},
 {"title":"Newsletter inclusion", "weight":30,"url":BASE+"newsletter.txt",
  "requirement":"The public newsletter must name Nova Tools and explain its developer toolkit in at least one meaningful sentence. A sponsor name without any product explanation is partial delivery, not full delivery."},
 {"title":"Session listing", "weight":20,"url":BASE+"listing.txt",
  "requirement":"The published session listing must attribute the opening session to Nova Tools as sponsor. A complete listing with no Nova Tools attribution is not fulfilled. A wallet challenge by itself is not sponsor attribution."},
]

def save(record):
    record["updated_at"]=datetime.now(timezone.utc).isoformat()
    pending=RECORD.with_suffix(".tmp")
    pending.write_text(json.dumps(record,indent=2,default=str)+"\n",encoding="utf-8")
    pending.replace(RECORD)

def run_tx(record, clients, step, role, method, args, value=0, reject=None):
    prior=record["transactions"].get(step)
    client=clients[role]
    if not prior:
        tx=str(client.write_contract(address=record["contract"],function_name=method,args=args,value=value))
        prior={"hash":tx,"role":role,"method":method,"args":args,"value_atto":str(value),"expected_error":reject}
        record["transactions"][step]=prior; save(record)
        print(json.dumps({"step":step,"submitted":tx}),flush=True)
    receipt=client.wait_for_transaction_receipt(prior["hash"],status=TransactionStatus.FINALIZED,interval=5000,retries=180,full_transaction=True)
    succeeded=tx_execution_succeeded(receipt)
    prior["execution_succeeded"]=succeeded
    prior["status"]=str(receipt.get("status"))
    prior["result_name"]=receipt.get("result_name")
    valid=(not succeeded and reject in json.dumps(receipt,default=str)) if reject else succeeded
    prior["expected_outcome_verified"]=valid; save(record)
    if not valid:
        prior["failure_receipt"]=receipt; save(record)
        raise RuntimeError("Unexpected execution result for "+step+"; journal retained")
    print(json.dumps({"step":step,"verified":"rejection" if reject else "success"}),flush=True)

def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--phase",choices=["prepare","finish"],required=True)
    phase=parser.parse_args().phase
    deployed=json.loads((ROOT/"deployments/sponsorproof_studionet.json").read_text())
    master=Account.from_key(_load_signer())
    accounts={role:Account.from_key(hmac.new(master.key,("sponsorproof/v1/"+role).encode(),hashlib.sha256).digest()) for role in ("sponsor","organizer","outsider")}
    clients={role:create_client(chain=studionet,account=account) for role,account in accounts.items()}
    reader=clients["sponsor"]
    record=json.loads(RECORD.read_text()) if RECORD.exists() else {"contract":deployed["address"],"network":"studionet","budget_atto":str(BUDGET),
        "fixture_notice":"Controlled release fixtures; not real sponsorship, external customers or adoption. All GEN is simulated.",
        "wallets":{role:account.address for role,account in accounts.items()},"transactions":{},"commitments":ROWS,"deadline":int(time.time())+7200}
    assert record["contract"]==deployed["address"]
    save(record)
    def read(method,args):
        return read_studionet_view(reader,record["contract"],method,args)
    run_tx(record,clients,"propose","sponsor","propose",["Open Builders Workshop · controlled demo",accounts["organizer"].address,json.dumps(ROWS),BUDGET,record["deadline"],120])
    if "campaign_id" not in record:
        matches=[row for row in read("list_campaigns",[0,20])["items"] if row["sponsor"].lower()==accounts["sponsor"].address.lower()]
        assert len(matches)==1
        record["campaign_id"]=matches[0]["id"]; save(record)
    cid=record["campaign_id"]
    state=read("get_campaign",[cid])
    record["challenges"]={row["id"]:read("get_challenge",[cid,row["id"]]) for row in state["commitments"]}; save(record)
    if phase=="prepare":
        print(json.dumps({"campaign_id":cid,"challenges":record["challenges"]}),flush=True); return
    if record.get("completed_at"):
        print(json.dumps({"state":"already_completed"}),flush=True); return
    run_tx(record,clients,"reject_outsider_accept","outsider","accept",[cid,state["terms_digest"]],reject="only the two agreement parties")
    run_tx(record,clients,"accept","organizer","accept",[cid,state["terms_digest"]])
    if "faucet_hash" not in record:
        record["faucet_hash"]="0x"+bytes(reader.fund_account(accounts["sponsor"].address,BUDGET)).hex(); save(record)
    reader.wait_for_transaction_receipt(record["faucet_hash"],status=TransactionStatus.FINALIZED,interval=5000,retries=120)
    run_tx(record,clients,"reject_underfunding","sponsor","fund",[cid],value=BUDGET-1,reject="exact agreed budget")
    run_tx(record,clients,"fund","sponsor","fund",[cid],value=BUDGET)
    for row in state["commitments"]:
        run_tx(record,clients,"capture_"+row["id"],"organizer","capture",[cid,row["id"]])
    run_tx(record,clients,"seal_organizer","organizer","seal_evidence",[cid])
    run_tx(record,clients,"seal_sponsor","sponsor","seal_evidence",[cid])
    run_tx(record,clients,"evaluate","outsider","evaluate",[cid])
    state=read("get_campaign",[cid]); record["initial"]=state; save(record)
    run_tx(record,clients,"reject_premature_settlement","outsider","settle",[cid],reject="closed review")
    run_tx(record,clients,"appeal_organizer","organizer","appeal",[cid,"Please independently reconsider the newsletter requirement against the captured text. A sponsor name appears, but no product description; preserve the distinction between partial and full delivery."])
    run_tx(record,clients,"appeal_sponsor","sponsor","appeal",[cid,"Please also consider the session listing: its publication should not count as sponsored without an actual Nova Tools attribution. The wallet challenge is provenance only, not performance evidence."])
    while time.time()<state["review_deadline"]+2:
        remaining=max(1,int(state["review_deadline"]+2-time.time()))
        print(json.dumps({"state":"waiting_for_shared_review_window","seconds":remaining}),flush=True)
        time.sleep(min(20,remaining))
    run_tx(record,clients,"resolve_appeal","outsider","resolve_appeal",[cid])
    run_tx(record,clients,"settle","outsider","settle",[cid])
    state=read("get_campaign",[cid]); record["final"]=state
    assert state["status"]=="SETTLED" and len(state["history"])==2
    assert state["history"][0]==record["initial"]["history"][0]
    assert int(state["organizer_allocation"])+int(state["sponsor_allocation"])+int(state["held_atto"])==BUDGET
    record["credits_before_claim"]={role:read("get_credit",[accounts[role].address]) for role in ("sponsor","organizer")}; save(record)
    for role in ("sponsor","organizer"):
        if int(record["credits_before_claim"][role]):
            run_tx(record,clients,"claim_"+role,role,"claim",[])
    record["credits_after_claim"]={role:read("get_credit",[accounts[role].address]) for role in ("sponsor","organizer")}
    assert all(value=="0" for value in record["credits_after_claim"].values())
    record["completed_at"]=datetime.now(timezone.utc).isoformat(); save(record)
    print(json.dumps({"state":"completed","organizer_atto":state["organizer_allocation"],"sponsor_atto":state["sponsor_allocation"]}),flush=True)

if __name__=="__main__":
    main()
