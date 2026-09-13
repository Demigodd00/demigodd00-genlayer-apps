"""StudioNet-only, resumable Lacuna deployment/acceptance transport.

Private keys never enter the journal. Every signed write is journaled before
broadcast; ambiguous broadcasts are recovered, never blindly repeated.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

import requests
from eth_account import Account
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.client.genlayer_client import GenLayerClient
from genlayer_py.types import TransactionHashVariant
from web3 import Web3
from web3.logs import DISCARD

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "contracts/lacuna.py"
DEPLOYMENT = ROOT / "deployments/lacuna_studionet.json"
EXPECTED_SIGNER = "0x1adf37F016384714F683CaC4d0a261A6d4e27033"


def now():
    return datetime.now(timezone.utc).isoformat()


def emit(value):
    print(json.dumps(value, default=str), flush=True)


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(".json.tmp")
    pending.write_text(json.dumps(value, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    pending.replace(path)


def signer():
    values = {}
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                name, value = line.split("=", 1)
                values[name.strip()] = value.strip().strip('"').strip("'")
    key = os.environ.get("LACUNA_PRIVATE_KEY") or values.get("LACUNA_PRIVATE_KEY") or values.get("STREAKPACT_PRIVATE_KEY")
    if not key:
        raise RuntimeError("No saved StudioNet signer; never generate a replacement")
    account = Account.from_key(key)
    if account.address.lower() != EXPECTED_SIGNER.lower():
        raise RuntimeError("Saved StudioNet signer does not match the authorized deployment wallet")
    return account


def source_hash(code):
    return hashlib.sha256(code.replace("\r\n", "\n").encode()).hexdigest()


class Runtime:
    def __init__(self, journal):
        sponsor = signer()
        challenger = Account.from_key(hmac.new(sponsor.key, b"lacuna/studionet/challenger/v1", hashlib.sha256).digest())
        self.accounts = {"sponsor": sponsor, "challenger": challenger}
        self.path = ROOT / "deployments" / journal
        self.record = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {
            "network": "studionet", "started_at": now(), "transactions": {},
            "wallets": {k: v.address for k, v in self.accounts.items()},
        }
        if self.record["wallets"] != {k: v.address for k, v in self.accounts.items()}:
            raise RuntimeError("Journal wallet mismatch")
        self.active = None
        self.last_request = 0
        self.http = requests.Session()
        self.client = GenLayerClient(deepcopy(studionet), sponsor)
        self.client.provider.make_request = self.rpc
        self.client.initialize_consensus_smart_contract()
        self.address = self.record.get("contract", "")

    def save(self):
        self.record["updated_at"] = now()
        save_json(self.path, self.record)

    def rpc(self, method, params):
        entry = self.record["transactions"].get(self.active)
        if method == "eth_sendRawTransaction" and entry is not None:
            entry.update(broadcast_attempted=True, evm_transaction_hash=Web3.to_hex(Web3.keccak(hexstr=params[0])))
            self.save()
        for attempt in range(1 if method == "eth_sendRawTransaction" else 4):
            time.sleep(max(0, 2.3 - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            try:
                response = self.http.post("https://studio.genlayer.com/api", json={
                    "jsonrpc": "2.0", "id": int(time.time()*1000), "method": method, "params": params,
                }, timeout=(10, 55))
                response.raise_for_status()
                payload = response.json()
                if payload.get("error"):
                    raise RuntimeError(f"{method}: {payload['error']}")
                if method == "eth_sendRawTransaction" and entry is not None:
                    entry["evm_transaction_hash"] = payload["result"]
                    self.save()
                return payload
            except (requests.RequestException, ValueError):
                if method == "eth_sendRawTransaction" or attempt == 3:
                    raise
                time.sleep(3)

    def receipt(self, tx):
        return self.rpc("eth_getTransactionByHash", [tx])["result"]

    def wait(self, tx, label):
        deadline, previous = time.monotonic() + 1000, None
        while time.monotonic() < deadline:
            receipt = self.receipt(tx)
            status = receipt.get("status") if receipt else None
            if status != previous:
                emit({"step": label, "status": status, "hash": tx})
                previous = status
            if status == "FINALIZED":
                if not tx_execution_succeeded(receipt):
                    raise RuntimeError(f"{label}: finalized with execution failure: {receipt.get('consensus_data', {}).get('leader_receipt')}")
                return receipt
            if status in ("CANCELED", "CANCELLED", "UNDETERMINED"):
                raise RuntimeError(f"{label}: {status}; no accepted result; do not repeat a broadcast blindly")
            time.sleep(8)
        raise RuntimeError(f"{label} pending; rerun this script to resume the same hash")

    def write(self, step, method, args, *, value=0, role="sponsor", code=None):
        signature = {"method": method, "args": args, "value_atto": str(value), "role": role,
                     "source_sha256": source_hash(code) if code else None}
        entry = self.record["transactions"].get(step)
        if entry:
            if any(entry.get(k) != v for k, v in signature.items()):
                raise RuntimeError(f"{step}: journal arguments differ")
            if entry.get("checked"):
                return self.receipt(entry["hash"])
        else:
            entry = {**signature, "started_at": now(), "broadcast_attempted": False}
            self.record["transactions"][step] = entry
            self.save()
        self.active = step
        self.client.local_account = self.accounts[role]
        if entry.get("broadcast_attempted") and not entry.get("hash"):
            receipt = self.client.w3.eth.get_transaction_receipt(entry["evm_transaction_hash"])
            contract = self.client.w3.eth.contract(abi=self.client.chain.consensus_main_contract["abi"])
            events = contract.get_event_by_name("NewTransaction").process_receipt(receipt, DISCARD)
            if len(events) != 1:
                raise RuntimeError("Ambiguous broadcast; inspect recorded EVM hash before any further write")
            entry["hash"] = Web3.to_hex(events[0]["args"]["txId"])
            self.save()
        if not entry.get("hash"):
            emit({"step": step, "submitting": method, "wallet": self.accounts[role].address})
            tx = self.client.deploy_contract(code=code, args=[]) if code else self.client.write_contract(
                address=self.address, function_name=method, args=args, value=value)
            entry["hash"] = tx if isinstance(tx, str) else Web3.to_hex(tx)
            self.save()
        receipt = self.wait(entry["hash"], step)
        entry.update(checked=True, status="FINALIZED", execution_succeeded=True,
                     triggered_transactions=receipt.get("triggered_transactions", []), finished_at=now())
        self.active = None
        self.save()
        return receipt

    def read(self, method, args=None):
        return self.client.read_contract(address=self.address, function_name=method, args=args or [],
                                         transaction_hash_variant=TransactionHashVariant.LATEST_FINAL)

    def verify_source(self):
        code = base64.b64decode(self.rpc("gen_getContractCode", [self.address])["result"], validate=True).decode()
        if source_hash(code) != source_hash(SOURCE.read_text(encoding="utf-8")):
            raise RuntimeError("Deployed source differs from local source")
        return source_hash(code)

    def follow(self, parent, label):
        children = parent.get("triggered_transactions", [])
        if len(children) != 1:
            raise RuntimeError(f"{label}: expected exactly one autonomous stage")
        child = self.wait(children[0], label)
        if child.get("from_address", "").lower() != self.address.lower() or child.get("to_address", "").lower() != self.address.lower():
            raise RuntimeError(f"{label}: unexpected self-call provenance")
        self.record.setdefault("autonomous_stages", {})[label] = {
            "hash": children[0], "status": "FINALIZED", "execution_succeeded": True,
            "from": child["from_address"], "to": child["to_address"],
        }
        self.save()
        return child

    def payout(self, step, account, value):
        parent = self.write(step, "withdraw_credit", [account])
        children = parent.get("triggered_transactions", [])
        if len(children) != 1:
            raise RuntimeError("Expected one native transfer")
        child = None
        for _ in range(75):
            child = self.receipt(children[0])
            if child and child.get("status") == "FINALIZED":
                break
            time.sleep(8)
        if not child or child.get("status") != "FINALIZED" or child.get("value_credited") is not True:
            raise RuntimeError("Native transfer has not finalized and credited")
        if (child.get("from_address", "").lower() != self.address.lower()
                or child.get("to_address", "").lower() != account.lower() or int(child.get("value", 0)) != value):
            raise RuntimeError("Native transfer value or recipient mismatch")
        self.record.setdefault("native_transfers", {})[step] = {
            "hash": children[0], "recipient": account, "value_atto": str(value),
            "status": "FINALIZED", "value_credited": True, "checked_at": now(),
        }
        self.save()
        emit({"payout_verified": step, "recipient": account, "value_atto": str(value)})

    def fund_challenger(self):
        """Signed native StudioNet transfer; no simulator-only funding bypass."""
        step, value = "fund-challenger", 10**15
        sender, recipient = self.accounts["sponsor"], self.accounts["challenger"].address
        entry = self.record["transactions"].get(step)
        if entry and entry.get("checked"):
            return
        if not entry:
            balance = int(self.rpc("eth_getBalance", [sender.address, "latest"])["result"], 16)
            if balance < value + 3 * 10**15:
                raise RuntimeError("Saved sponsor needs test GEN from the StudioNet faucet")
            entry = {"recipient": recipient, "value_atto": str(value), "broadcast_attempted": False}
            self.record["transactions"][step] = entry
            self.save()
        self.active = step
        if not entry.get("broadcast_attempted"):
            nonce = int(self.rpc("eth_getTransactionCount", [sender.address, "latest"])["result"], 16)
            signed = sender.sign_transaction({"to": recipient, "value": value, "chainId": 61999,
                                               "gas": 21000, "gasPrice": 0, "nonce": nonce})
            self.rpc("eth_sendRawTransaction", [Web3.to_hex(signed.raw_transaction)])
        tx = entry["evm_transaction_hash"]
        for _ in range(90):
            receipt = self.receipt(tx)
            if receipt and receipt.get("status") == "FINALIZED":
                if receipt.get("value_credited") is not True or int(receipt.get("value", 0)) != value:
                    raise RuntimeError("Native test funding did not credit the requested value")
                entry.update(hash=tx, checked=True, status="FINALIZED", value_credited=True)
                self.active = None
                self.save()
                emit({"test_funding_verified": recipient, "value_atto": str(value)})
                return
            time.sleep(8)
        raise RuntimeError("Test funding still pending; resume the recorded transaction")
