"""Second controlled StudioNet run: both appeal statements, without changing v1.

prepare: propose and print the exact publication challenges.
finish: use published fixtures, accept/fund/capture/judge, appeal from both wallets,
wait for the real shared deadline, resolve, settle and claim. Never resets a run.
"""
import argparse
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus
import seed_sponsorproof as base
from hackathon_judge_rpc import read_studionet_view

base.RECORD=base.ROOT/"deployments/sponsorproof_bilateral_demo.json"
REVIEW_SECONDS=600
TITLE="Open Builders Workshop · bilateral appeal demo"
ROWS=[{**row,"url":row["url"].replace("/sponsorproof/","/sponsorproof-bilateral/")} for row in base.ROWS]
ARGUMENTS={
    "organizer":"Please independently reconsider the newsletter against the locked requirement. It names Nova Tools but contains no product explanation. Assess whether this is partial rather than full delivery, using only the frozen newsletter.",
    "sponsor":"Please independently reconsider the session listing. It must attribute the opening session to Nova Tools. Its wallet challenge proves publication control, not sponsorship delivery. Assess the actual frozen schedule, not the challenge.",
}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--phase",choices=["prepare","finish"],required=True)
    phase=parser.parse_args().phase
    deployed=json.loads((base.ROOT/"deployments/sponsorproof_studionet.json").read_text())
    master=Account.from_key(base._load_signer())
    accounts={role:Account.from_key(hmac.new(master.key,("sponsorproof/bilateral-v1/"+role).encode(),hashlib.sha256).digest()) for role in ("sponsor","organizer","outsider")}
    clients={role:create_client(chain=studionet,account=account) for role,account in accounts.items()}
    reader=clients["sponsor"]
    record=json.loads(base.RECORD.read_text()) if base.RECORD.exists() else {
        "contract":deployed["address"],"network":"studionet","title":TITLE,
        "fixture_notice":"Controlled bilateral appeal acceptance fixture; not external users, real sponsorship or adoption. All GEN is simulated.",
        "budget_atto":str(base.BUDGET),"review_seconds":REVIEW_SECONDS,
        "wallets":{role:account.address for role,account in accounts.items()},
        "commitments":ROWS,"deadline":int(time.time())+4*3600,"transactions":{},
    }
    assert record["contract"]==deployed["address"] and record["review_seconds"]==REVIEW_SECONDS
    assert record["wallets"]=={role:account.address for role,account in accounts.items()}
    if record.get("completed_at"):
        print(json.dumps({"state":"already_completed","campaign_id":record["campaign_id"]}),flush=True)
        return
    base.save(record)
    def read(method,args):
        return read_studionet_view(reader,record["contract"],method,args)
    def tx(step,role,method,args,value=0):
        base.run_tx(record,clients,step,role,method,args,value=value)

    tx("propose","sponsor","propose",[TITLE,accounts["organizer"].address,json.dumps(ROWS),base.BUDGET,record["deadline"],REVIEW_SECONDS])
    if "campaign_id" not in record:
        matches=[]; offset=0
        while True:
            page=read("list_campaigns",[offset,20])
            matches.extend(row for row in page["items"] if row["sponsor"].lower()==accounts["sponsor"].address.lower() and row["title"]==TITLE)
            offset+=20
            if offset>=int(page["total"]):break
        assert len(matches)==1
        record["campaign_id"]=matches[0]["id"]
        base.save(record)
    cid=record["campaign_id"]; state=read("get_campaign",[cid])
    if "challenges" not in record:
        record["challenges"]={row["id"]:read("get_challenge",[cid,row["id"]]) for row in state["commitments"]}
        base.save(record)
    if phase=="prepare":
        print(json.dumps({"campaign_id":cid,"challenges":record["challenges"]}),flush=True)
        return

    tx("accept","organizer","accept",[cid,state["terms_digest"]])
    if "faucet_hash" not in record:
        record["faucet_hash"]="0x"+bytes(reader.fund_account(accounts["sponsor"].address,base.BUDGET)).hex()
        base.save(record)
    reader.wait_for_transaction_receipt(record["faucet_hash"],status=TransactionStatus.FINALIZED,interval=5000,retries=120)
    tx("fund","sponsor","fund",[cid],value=base.BUDGET)
    for row in state["commitments"]:
        tx("capture_"+row["id"],"organizer","capture",[cid,row["id"]])
    tx("seal_organizer","organizer","seal_evidence",[cid])
    tx("seal_sponsor","sponsor","seal_evidence",[cid])
    tx("evaluate","outsider","evaluate",[cid])
    if "initial" not in record:
        record["initial"]=read("get_campaign",[cid]); base.save(record)
    # No unrelated negative tests consume this run's shared review window.
    for role in ("organizer","sponsor"):
        tx("appeal_"+role,role,"appeal",[cid,ARGUMENTS[role]])
    if "both_appeals" not in record:
        appealed=read("get_campaign",[cid])
        assert appealed["status"]=="APPEAL_OPEN"
        assert appealed["appeals"]=={accounts[role].address.lower():ARGUMENTS[role] for role in ARGUMENTS}
        assert appealed["history"]==record["initial"]["history"]
        record["both_appeals"]=appealed; base.save(record)
    while time.time()<record["both_appeals"]["review_deadline"]+2:
        remaining=max(1,int(record["both_appeals"]["review_deadline"]+2-time.time()))
        print(json.dumps({"state":"both_appeals_verified_waiting_for_real_deadline","seconds":remaining}),flush=True)
        time.sleep(min(30,remaining))
    tx("resolve_appeal","outsider","resolve_appeal",[cid])
    tx("settle","outsider","settle",[cid])
    state=read("get_campaign",[cid])
    assert state["status"]=="SETTLED" and len(state["history"])==2
    assert state["history"][0]==record["initial"]["history"][0]
    assert state["appeals"]==record["both_appeals"]["appeals"]
    assert int(state["organizer_allocation"])+int(state["sponsor_allocation"])+int(state["held_atto"])==base.BUDGET
    record["final"]=state
    if "credits_before_claim" not in record:
        record["credits_before_claim"]={role:read("get_credit",[accounts[role].address]) for role in ARGUMENTS}
        assert record["credits_before_claim"]["organizer"]==state["organizer_allocation"]
        assert record["credits_before_claim"]["sponsor"]==state["sponsor_allocation"]
        base.save(record)
    for role in ARGUMENTS:
        if int(record["credits_before_claim"][role]):tx("claim_"+role,role,"claim",[])
    record["credits_after_claim"]={role:read("get_credit",[accounts[role].address]) for role in ARGUMENTS}
    assert all(value=="0" for value in record["credits_after_claim"].values())
    record["completed_at"]=datetime.now(timezone.utc).isoformat(); base.save(record)
    print(json.dumps({"state":"completed","campaign_id":cid,"organizer_atto":state["organizer_allocation"],"sponsor_atto":state["sponsor_allocation"],"both_appeals_accepted":True}),flush=True)

if __name__=="__main__":main()
