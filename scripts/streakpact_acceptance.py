"""Recorded, exact-release StudioNet reads and transactions. Never deploys a contract.

Uses the saved owner signer and a reproducible, domain-separated StudioNet test
account. Private keys never enter arguments, logs, or the public receipt record.
An existing transaction ID is polled instead of being submitted again.
"""

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import time
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

import requests
from eth_account import Account
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.client.genlayer_client import GenLayerClient
from web3 import Web3
from web3.logs import DISCARD

from deploy_streak_pact_v2 import load_deploy_environment

ROOT = Path(__file__).resolve().parents[1]
DEPLOYMENT = ROOT / "deployments/streak_pact_v2_studionet.json"
RECORD = ROOT / "deployments/streak_pact_v2_acceptance.json"
RPC_URL = "https://studio.genlayer.com/api"


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def output(value):
    print(json.dumps(value, default=str), flush=True)


def error_text(value):
    texts = []
    if isinstance(value, dict):
        for item in value.values():
            texts.extend(error_text(item))
    elif isinstance(value, (list, tuple)):
        for item in value:
            texts.extend(error_text(item))
    elif isinstance(value, str):
        texts.append(value)
        if 8 <= len(value) <= 100_000 and re.fullmatch(r"[A-Za-z0-9+/=]+", value):
            try:
                texts.append(base64.b64decode(value, validate=True).decode("utf-8", errors="ignore"))
            except (ValueError, TypeError):
                pass
    return texts


class Acceptance:
    def __init__(self, role):
        load_deploy_environment()
        self.deployment = json.loads(DEPLOYMENT.read_text(encoding="utf-8"))
        if self.deployment["network"] != "studionet":
            raise RuntimeError("Acceptance writes are restricted to StudioNet")
        owner = Account.from_key(os.environ["STREAKPACT_PRIVATE_KEY"])
        if owner.address.lower() != self.deployment["deployer"].lower():
            raise RuntimeError("The saved signer does not match the release owner")
        tester = Account.from_key(hmac.new(
            owner.key, b"streakpact/studionet/acceptance/tester/v1", hashlib.sha256,
        ).digest())
        self.accounts = {"maker": owner, "tester": tester}
        self.address = self.deployment["address"]
        self.active_id = None
        self.last_request = 0.0
        self.http = requests.Session()
        if RECORD.exists():
            self.record = json.loads(RECORD.read_text(encoding="utf-8"))
            if self.record["contract"].lower() != self.address.lower():
                raise RuntimeError("Existing acceptance record belongs to another release")
        else:
            self.record = {
                "network": "studionet", "contract": self.address,
                "source_sha256": self.deployment["source_sha256"],
                "started_at": timestamp(), "transactions": {},
            }
        self.record["wallets"] = {name: account.address for name, account in self.accounts.items()}
        self.role = role
        self.client = GenLayerClient(deepcopy(studionet), self.accounts[role])
        # Preserve the SDK's StudioNet chain behavior while bounding real HTTP calls.
        self.client.provider.make_request = self.rpc
        self.client.initialize_consensus_smart_contract()

    def save(self):
        self.record["updated_at"] = timestamp()
        temp = RECORD.with_suffix(".json.tmp")
        temp.write_text(json.dumps(self.record, indent=2, default=str) + "\n", encoding="utf-8")
        temp.replace(RECORD)

    def rpc(self, method, params):
        delay = 2.25 - (time.monotonic() - self.last_request)
        if delay > 0:
            time.sleep(delay)
        if method == "eth_sendRawTransaction" and self.active_id:
            entry = self.record["transactions"][self.active_id]
            entry["broadcast_attempted"] = True
            entry["evm_transaction_hash"] = Web3.to_hex(Web3.keccak(hexstr=params[0]))
            self.save()
        self.last_request = time.monotonic()
        response = self.http.post(RPC_URL, json={
            "jsonrpc": "2.0", "id": int(time.time() * 1000),
            "method": method, "params": params,
        }, timeout=(10, 120))
        response.raise_for_status()
        payload = response.json()
        if payload.get("error"):
            err = payload["error"]
            raise RuntimeError(f"{method}: RPC {err.get('code')}: {err.get('message')}")
        if method == "eth_sendRawTransaction" and self.active_id:
            self.record["transactions"][self.active_id]["evm_transaction_hash"] = payload["result"]
            self.save()
        return payload

    def read(self, method, args):
        return self.client.read_contract(address=self.address, function_name=method, args=args)

    def preflight(self):
        source = base64.b64decode(self.rpc("gen_getContractCode", [self.address])["result"])
        digest = hashlib.sha256(source).hexdigest()
        if digest != self.deployment["source_sha256"]:
            raise RuntimeError("Deployed source differs from the recorded release")
        config = self.read("get_config", [])
        if config["fee_bps"] != "0" or config["period_secs"] != "60" or config["appeal_window_secs"] != "300":
            raise RuntimeError("Unexpected StudioNet release configuration")
        self.record["preflight"] = {"checked_at": timestamp(), "config": config, "source_matches": True}
        self.save()
        return {"contract": self.address, "wallets": self.record["wallets"], "config": config, "source_matches": True}

    def write(self, step_id, method, args, value, expected_error):
        entries = self.record["transactions"]
        entry = entries.get(step_id)
        if entry:
            if (entry["method"], entry["args"], entry["role"], entry["value_atto"], entry["expected_error"]) != (method, args, self.role, str(value), expected_error):
                raise RuntimeError("Step ID already records different transaction arguments")
            if entry.get("checked"):
                return entry
        else:
            entry = {
                "method": method, "args": args, "role": self.role,
                "sender": self.accounts[self.role].address, "value_atto": str(value),
                "expected_error": expected_error, "started_at": timestamp(),
                "broadcast_attempted": False,
            }
            entries[step_id] = entry
            self.save()
        self.active_id = step_id
        if entry.get("broadcast_attempted") and not entry.get("transaction_hash"):
            # Recover a submitted transaction after an interrupted HTTP request.
            receipt = self.client.w3.eth.get_transaction_receipt(entry["evm_transaction_hash"])
            consensus = self.client.w3.eth.contract(abi=self.client.chain.consensus_main_contract["abi"])
            events = consensus.get_event_by_name("NewTransaction").process_receipt(receipt, DISCARD)
            if not events:
                raise RuntimeError("Broadcast has no recoverable GenLayer transaction; do not resubmit blindly")
            entry["transaction_hash"] = Web3.to_hex(events[0]["args"]["txId"])
            self.save()
        if not entry.get("transaction_hash"):
            output({"step": step_id, "state": "submitting", "method": method, "sender": entry["sender"]})
            entry["transaction_hash"] = self.client.write_contract(
                address=self.address, function_name=method, args=args, value=value,
            )
            self.save()
        output({"step": step_id, "transaction_hash": entry["transaction_hash"]})
        deadline = time.monotonic() + 600
        previous = None
        while time.monotonic() < deadline:
            receipt = self.rpc("eth_getTransactionByHash", [entry["transaction_hash"]])["result"]
            if not receipt:
                time.sleep(5)
                continue
            status = receipt.get("status")
            if status != previous:
                output({"step": step_id, "status": status})
                previous = status
            if status == "FINALIZED":
                success = tx_execution_succeeded(receipt)
                leaders = receipt.get("consensus_data", {}).get("leader_receipt", [])
                if isinstance(leaders, dict):
                    leaders = [leaders]
                entry.update({
                    "status": status, "execution_succeeded": success,
                    "finished_at": timestamp(),
                    "leader_execution_result": leaders[0].get("execution_result") if leaders else None,
                    "emitted_transactions": leaders[0].get("pending_transactions", []) if leaders else [],
                    "triggered_transactions": receipt.get("triggered_transactions", []),
                })
                if expected_error:
                    if success or not any(expected_error.lower() in item.lower() for item in error_text(receipt)):
                        self.save()
                        raise RuntimeError("Expected contract rejection was not verified")
                elif not success:
                    entry["failure_detail"] = leaders[0].get("genvm_result") if leaders else None
                    self.save()
                    raise RuntimeError("Transaction finalized with a contract execution failure")
                entry["checked"] = True
                self.save()
                return entry
            time.sleep(5)
        raise RuntimeError("Transaction is still pending; resume this same step ID instead of resubmitting")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["preflight", "read", "write"])
    parser.add_argument("--role", choices=["maker", "tester"], default="maker")
    parser.add_argument("--method")
    parser.add_argument("--args-json", default="[]")
    parser.add_argument("--value", type=int, default=0)
    parser.add_argument("--id")
    parser.add_argument("--expect-error")
    options = parser.parse_args()
    runner = Acceptance(options.role)
    if options.action == "preflight":
        output(runner.preflight())
    elif options.action == "read":
        output(runner.read(options.method, json.loads(options.args_json)))
    else:
        if not options.id or not options.method:
            parser.error("writes require --id and --method")
        output(runner.write(options.id, options.method, json.loads(options.args_json), options.value, options.expect_error))


if __name__ == "__main__":
    main()
