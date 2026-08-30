"""Deploy and verify HackathonJudge on StudioNet.

The contract has no deployer or administrator privileges, so the default mode
uses a disposable signer on gasless StudioNet. Set HACKATHON_JUDGE_PRIVATE_KEY
only when a recoverable deployment identity is desired.
"""

import base64
import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from eth_account import Account
from eth_utils import to_checksum_address
from genlayer_py import create_client
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionHashVariant, TransactionStatus


ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = ROOT / "contracts" / "hackathon_judge.py"
DEPLOYMENT_PATH = ROOT / "deployments" / "hackathon_judge_studionet.json"


def _source_digest(code: str) -> str:
    return hashlib.sha256(code.replace("\r\n", "\n").encode("utf-8")).hexdigest()


def _extract_contract_address(receipt: dict) -> str:
    for key in ("tx_data_decoded", "data"):
        value = receipt.get(key)
        if isinstance(value, dict) and value.get("contract_address"):
            return to_checksum_address(value["contract_address"])
    raise RuntimeError("Finalized deployment receipt is missing its contract address")


def _verify_source(client, address: str, expected_code: str) -> str:
    response = client.provider.make_request(method="gen_getContractCode", params=[address])
    encoded = response.get("result")
    if not isinstance(encoded, str):
        raise RuntimeError("Could not retrieve deployed contract source")
    try:
        deployed_code = base64.b64decode(encoded, validate=True).decode("utf-8")
    except (ValueError, UnicodeError):
        raise RuntimeError("Deployed source was not valid encoded Python") from None
    expected_digest = _source_digest(expected_code)
    if _source_digest(deployed_code) != expected_digest:
        raise RuntimeError("Deployed source does not match the linted local contract")
    return expected_digest


def _record_deployment(record: dict) -> None:
    DEPLOYMENT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DEPLOYMENT_PATH.exists():
        previous = json.loads(DEPLOYMENT_PATH.read_text(encoding="utf-8"))
        previous_address = to_checksum_address(previous["address"])
        if previous_address.lower() != record["address"].lower():
            history_dir = DEPLOYMENT_PATH.parent / "history"
            history_dir.mkdir(exist_ok=True)
            history_path = history_dir / (
                DEPLOYMENT_PATH.stem + "_" + previous_address[2:].lower() + ".json"
            )
            if history_path.exists():
                if json.loads(history_path.read_text(encoding="utf-8")) != previous:
                    raise RuntimeError("Existing deployment history differs; refusing to overwrite it")
            else:
                history_path.write_text(json.dumps(previous, indent=2) + "\n", encoding="utf-8")
            record["previous_address"] = previous_address
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=DEPLOYMENT_PATH.parent,
        prefix="hackathon-judge-",
        suffix=".json.tmp",
        delete=False,
    ) as temporary:
        json.dump(record, temporary, indent=2)
        temporary.write("\n")
        pending_path = Path(temporary.name)
    pending_path.replace(DEPLOYMENT_PATH)


def main() -> None:
    private_key = os.environ.get("HACKATHON_JUDGE_PRIVATE_KEY", "").strip()
    if private_key:
        try:
            account = Account.from_key(private_key)
        except (ValueError, TypeError):
            raise RuntimeError("HACKATHON_JUDGE_PRIVATE_KEY is invalid") from None
        signer_mode = "recoverable_signer"
    else:
        account = Account.create()
        signer_mode = "disposable_studionet_deployment_only"

    code = CODE_PATH.read_text(encoding="utf-8")
    client = create_client(chain=studionet, account=account)
    print(f"network=studionet signer={account.address} mode={signer_mode}", flush=True)
    print("The deployment signer receives no contract role or privilege.", flush=True)
    tx_hash = client.deploy_contract(code=code, account=account, args=[])
    print(f"tx={tx_hash}", flush=True)
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        status=TransactionStatus.FINALIZED,
        interval=3000,
        retries=120,
        full_transaction=True,
    )
    if (receipt.get("status_name") or receipt.get("statusName")) != TransactionStatus.FINALIZED.value:
        raise RuntimeError("Deployment did not finalize")
    if not tx_execution_succeeded(receipt):
        raise RuntimeError("Deployment finalized with an execution failure")

    address = _extract_contract_address(receipt)
    digest = _verify_source(client, address, code)
    config = client.read_contract(
        address=address,
        function_name="get_config",
        args=[],
        account=account,
        transaction_hash_variant=TransactionHashVariant.LATEST_FINAL,
    )
    expected = {
        "version": "2.1.0",
        "network_target": "studionet",
        "funding_model": "WITHDRAWABLE_DEPOSIT_CREDIT_V1",
        "evidence_schema": "hackathon-judge-snapshot-v3",
        "evidence_policy": "VALIDATOR_AGREED_IMMUTABLE_RENDER_SNAPSHOT",
        "judging_policy": "INDEPENDENT_COMPARATIVE_DECISION_FIELDS",
        "reasoning_policy": "WORDING_EXEMPT_FROM_EQUIVALENCE",
        "appeal_policy": "ONE_ENTRANT_APPEAL_WITH_OPTIONAL_NEW_SNAPSHOT",
        "liveness_policy": "PERMISSIONLESS_TIMEOUT_TO_INCONCLUSIVE",
        "judgment_timeout_secs": "86400",
    }
    if not isinstance(config, dict) or any(config.get(key) != value for key, value in expected.items()):
        raise RuntimeError("Deployed configuration does not match this release")

    record = {
        "contract": "HackathonJudge",
        "version": config["version"],
        "network": "studionet",
        "address": address,
        "transaction_hash": str(tx_hash),
        "deployer": account.address,
        "deployer_role": "deployment_only_no_privileged_access",
        "signer_mode": signer_mode,
        "source_sha256": digest,
        "receipt_status": "FINALIZED",
        "execution_result": "SUCCESS",
        "verified_source_and_config": True,
        "deployed_at": datetime.now(timezone.utc).isoformat(),
    }
    _record_deployment(record)
    print(f"Verified HackathonJudge {config['version']} at {address}", flush=True)
    print(f"Source SHA-256: {digest}", flush=True)
    print(f"Recorded deployment in {DEPLOYMENT_PATH}", flush=True)


if __name__ == "__main__":
    main()
