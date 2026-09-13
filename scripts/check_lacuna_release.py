"""Read-only release gate: local source, public website, on-chain cases and payments.

No signer or private environment variables are needed. Never performs writes.
"""
import base64
import hashlib
import json
import time
from pathlib import Path

import requests
from genlayer_py.abi import calldata
from genlayer_py.abi.transactions import serialize
from genlayer_py.contracts.utils import make_calldata_object
from genlayer_py.types import TransactionHashVariant
from genlayer_py.assertions import tx_execution_succeeded

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = "https://lacuna-sepia.vercel.app"


def main():
    deployment = json.loads((ROOT / "deployments/lacuna_studionet.json").read_text(encoding="utf-8"))
    acceptance = json.loads((ROOT / "deployments/lacuna_acceptance_011.json").read_text(encoding="utf-8"))
    digest = hashlib.sha256((ROOT / "contracts/lacuna.py").read_bytes().replace(b"\r\n", b"\n")).hexdigest()
    address = deployment["address"]
    assert deployment["network"] == acceptance["network"] == "studionet"
    assert deployment["version"] == "0.1.1-studionet"
    assert deployment["source_sha256"] == acceptance["source_sha256"] == digest
    assert acceptance["contract"].lower() == address.lower()
    assert acceptance.get("status") == "PASS", "Live acceptance has not completed"
    def rpc(method, params):
        time.sleep(2.5)
        response = requests.post("https://studio.genlayer.com/api", json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=55)
        response.raise_for_status()
        payload = response.json()
        assert not payload.get("error"), payload.get("error")
        return payload["result"]

    def read(method, args=None):
        # The SDK's read_contract helper unnecessarily requires a local signer.
        # Use its public encoding primitives for an unsigned finalized-state read.
        encoded = calldata.encode(make_calldata_object(method=method, args=args or [], kwargs=None))
        result = rpc("gen_call", [{
            "type": "read", "to": address,
            "from": "0x0000000000000000000000000000000000000000",
            "data": serialize([encoded, b"\x00"]),
            "transaction_hash_variant": TransactionHashVariant.LATEST_FINAL.value,
        }])
        return calldata.decode(bytes.fromhex(result.removeprefix("0x")))

    deployed_source = base64.b64decode(rpc("gen_getContractCode", [address]), validate=True)
    assert hashlib.sha256(deployed_source.replace(b"\r\n", b"\n")).hexdigest() == digest
    health_response = requests.get(WEBSITE + "/api/health", timeout=55)
    health_response.raise_for_status()
    health = health_response.json()
    assert health["ok"] is True and health["contract"].lower() == address.lower()
    assert health["stats"]["version"] == "0.1.1-studionet"
    stats = read("get_stats")
    assert stats["accounting_balanced"] is True and stats["admin_controls"] is False and stats["fee_bps"] == "0"
    expected = {"abstention": "NO_FINDING", "seeded-control": "CONFIRMED_FINDING", "contradiction": "INVALID_ATTEMPT"}
    for name, status in expected.items():
        case = acceptance["cases"][name]
        actual = read("get_attempt", [case["attempt_id"]])
        assert actual["status"] == status == case["observed"]["status"]
        for field in ("document", "completion_a", "completion_b", "target", "referee_one", "referee_two", "allocation_atto", "allocation_recipient"):
            assert actual[field] == case["observed"][field], (name, field)
        for stage in ("rule", "target", "referee-one", "referee-two"):
            stage_record = acceptance["autonomous_stages"][name + "/" + stage]
            tx = rpc("eth_getTransactionByHash", [stage_record["hash"]])
            assert tx["status"] == "FINALIZED" and tx_execution_succeeded(tx)
            assert tx["from_address"].lower() == address.lower() == tx["to_address"].lower()
        transfer = acceptance["native_transfers"]["withdraw-" + name]
        paid = rpc("eth_getTransactionByHash", [transfer["hash"]])
        assert paid["status"] == "FINALIZED" and paid["value_credited"] is True
        assert paid["from_address"].lower() == address.lower()
        assert paid["to_address"].lower() == actual["allocation_recipient"].lower()
        assert int(paid["value"]) == int(actual["allocation_atto"])
        print(json.dumps({"case": name, "status": status, "native_payment_verified": True}), flush=True)
    print(json.dumps({"release": "PASS", "website": WEBSITE, "contract": address,
        "source_sha256": digest, "accounting_balanced": stats["accounting_balanced"]}), flush=True)


if __name__ == "__main__":
    main()
