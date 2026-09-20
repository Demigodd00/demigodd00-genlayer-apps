"""Deploy SponsorProof once, reconcile pending receipts, and verify exact source."""
import json
from pathlib import Path
from datetime import datetime, timezone
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus
from deploy_hackathon_judge import _source_digest, _extract_contract_address, _verify_source
from hackathon_judge_rpc import read_studionet_view

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "contracts/sponsorproof.py"
RECORD = ROOT / "deployments/sponsorproof_studionet.json"
JOURNAL = ROOT / "deployments/sponsorproof_deploy_journal.json"

def main():
    code = SOURCE.read_text(encoding="utf-8")
    digest = _source_digest(code)
    account = Account.create()  # No deployer/admin privileges; disposable signer.
    client = create_client(chain=studionet, account=account)
    if RECORD.exists():
        saved = json.loads(RECORD.read_text())
        if saved["source_sha256"] != digest:
            raise RuntimeError("Preserve and reconcile the previous deployment before changing source")
        _verify_source(client, saved["address"], code)
        print(json.dumps({"state":"already_deployed", "address":saved["address"]}),flush=True)
        return
    pending = json.loads(JOURNAL.read_text()) if JOURNAL.exists() else {}
    if pending and pending["source_sha256"] != digest:
        raise RuntimeError("A pending deployment has different source; reconcile it first")
    if not pending:
        tx = str(client.deploy_contract(code=code, account=account, args=[]))
        pending = {"transaction_hash":tx,"source_sha256":digest,"deployer":account.address}
        JOURNAL.write_text(json.dumps(pending,indent=2)+"\n")
    print(json.dumps({"state":"waiting",**pending}),flush=True)
    receipt = client.wait_for_transaction_receipt(pending["transaction_hash"],status=TransactionStatus.FINALIZED,interval=5000,retries=180,full_transaction=True)
    if not tx_execution_succeeded(receipt):
        raise RuntimeError("Deployment execution failed: "+json.dumps(receipt,default=str))
    address = _extract_contract_address(receipt)
    _verify_source(client,address,code)
    config=read_studionet_view(client,address,"get_config",[])
    assert config["name"]=="SponsorProof" and config["version"]=="1.0.0"
    result={**pending,"address":address,"contract":"SponsorProof","network":"studionet","version":"1.0.0",
            "source_path":"contracts/sponsorproof.py","status":"FINALIZED","execution_result":"SUCCESS",
            "source_verified":True,"config":config,"deployed_at":datetime.now(timezone.utc).isoformat()}
    RECORD.write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps(result),flush=True)

if __name__=="__main__":
    main()
