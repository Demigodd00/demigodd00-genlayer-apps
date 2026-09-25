"""Resume-safe, public-evidence StudioNet acceptance. Never deploys or retries writes.

Uses dedicated recoverable test wallets and clearly labeled synthetic reports.
Secrets stay outside the frontend in .outagebond-private (git ignored).
"""
from __future__ import annotations

import argparse
import base64
import json
import time
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests
from eth_account import Account
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.client.genlayer_client import GenLayerClient
from genlayer_py.types import TransactionHashVariant
from web3 import Web3
from web3.logs import DISCARD

from deploy_outage_bond import atomic_json, verify_source, verify_configuration

ROOT = Path(__file__).resolve().parents[1]
RECORD = ROOT / "deployments/outage_bond_acceptance.json"
KEYS = ROOT / ".outagebond-private/acceptance-wallets.json"
PAYOUT = 10**15
RPC = "https://studio.genlayer.com/api"


def now():
    return datetime.now(timezone.utc).isoformat()


def output(value):
    print(json.dumps(value, default=str), flush=True)


class Acceptance:
    def __init__(self, origin: str):
        self.deployment = json.loads((ROOT / "deployments/outage_bond_studionet.json").read_text(encoding="utf-8"))
        assert self.deployment["network"] == "studionet"
        self.address = self.deployment["address"]
        self.origin = origin.rstrip("/")
        assert self.origin.startswith("https://")
        if not KEYS.exists():
            if RECORD.exists():
                raise RuntimeError("Recover the original acceptance wallets; do not replace them")
            KEYS.parent.mkdir(exist_ok=True)
            with KEYS.open("x", encoding="utf-8") as handle:
                json.dump({role: Account.create().key.hex() for role in ("provider", "beneficiary", "observer")}, handle)
        self.accounts = {role: Account.from_key(key) for role, key in json.loads(KEYS.read_text(encoding="utf-8")).items()}
        self.record = json.loads(RECORD.read_text(encoding="utf-8")) if RECORD.exists() else {
            "network": "studionet", "contract": self.address, "source_sha256": self.deployment["source_sha256"],
            "started_at": now(), "transactions": {}, "coverages": {}, "claims": {}, "assertions": {},
            "wallets": {role: account.address for role, account in self.accounts.items()},
            "fixture_disclosure": "Both reports are synthetic and demo-author controlled. Distinct hosts test live fetching, not operational independence or a real outage.",
            "frontend_origin": self.origin,
        }
        assert self.record["contract"] == self.address and self.record["frontend_origin"] == self.origin
        assert self.record["wallets"] == {role: account.address for role, account in self.accounts.items()}
        self.last_request = 0.0
        self.active_step = None
        self.http = requests.Session()
        self.client = GenLayerClient(deepcopy(studionet), self.accounts["provider"])
        self.client.provider.make_request = self.rpc
        self.client.initialize_consensus_smart_contract()
        self.save()

    def save(self):
        self.record["updated_at"] = now()
        atomic_json(RECORD, self.record)

    def rpc(self, method, params):
        writing = method in ("eth_sendRawTransaction", "sim_fundAccount")
        if method == "eth_sendRawTransaction" and self.active_step:
            self.record["transactions"][self.active_step].update({
                "broadcast_attempted": True, "evm_transaction_hash": Web3.to_hex(Web3.keccak(hexstr=params[0])),
            })
            self.save()
        for attempt in range(1 if writing else 3):
            time.sleep(max(0, 4.0-(time.monotonic()-self.last_request)))
            self.last_request = time.monotonic()
            try:
                response = self.http.post(RPC, json={"jsonrpc": "2.0", "id": int(time.time()*1000), "method": method, "params": params}, timeout=(10, 60))
                if response.status_code == 429 and not writing and attempt < 2:
                    delay = max(60, min(3600, int(response.headers.get("Retry-After", "60"))))
                    output({"phase": "rate-limit", "retry_after_seconds": delay, "method": method})
                    until = time.monotonic()+delay
                    while time.monotonic() < until:
                        time.sleep(min(30, until-time.monotonic()))
                    continue
                response.raise_for_status()
                payload = response.json()
                if payload.get("error"):
                    raise RuntimeError(f"{method}: {payload['error']}")
                return payload
            except (requests.RequestException, ValueError):
                if writing or attempt == 2:
                    raise
                time.sleep(3*(attempt+1))

    def read(self, method, args):
        return self.client.read_contract(address=self.address, function_name=method, args=args,
                                        transaction_hash_variant=TransactionHashVariant.LATEST_FINAL)

    def balance(self, account):
        value = self.rpc("eth_getBalance", [account, "latest"])["result"]
        return int(value, 16) if isinstance(value, str) and value.startswith("0x") else int(value)

    def write(self, step, method, args, *, role="provider", value=0, expect_failure=False):
        entry = self.record["transactions"].get(step)
        intent = {"method": method, "args": args, "sender": self.accounts[role].address, "value_atto": str(value), "expect_failure": expect_failure}
        if entry:
            assert all(entry[k] == v for k, v in intent.items()), f"Saved arguments changed: {step}"
            if entry.get("checked"):
                return entry
        else:
            entry = {**intent, "started_at": now(), "broadcast_attempted": False}
            self.record["transactions"][step] = entry
            self.save()
        self.active_step = step
        self.client.local_account = self.accounts[role]
        if entry.get("broadcast_attempted") and not entry.get("transaction_hash"):
            receipt = self.client.w3.eth.get_transaction_receipt(entry["evm_transaction_hash"])
            consensus = self.client.w3.eth.contract(abi=self.client.chain.consensus_main_contract["abi"])
            events = consensus.get_event_by_name("NewTransaction").process_receipt(receipt, DISCARD)
            if not events:
                raise RuntimeError("Broadcast cannot yet be reconciled. Do not send another write.")
            entry["transaction_hash"] = Web3.to_hex(events[0]["args"]["txId"])
            self.save()
        if not entry.get("transaction_hash"):
            output({"step": step, "state": "submitting"})
            result = self.client.write_contract(address=self.address, function_name=method, args=args, value=value)
            entry["transaction_hash"] = result if isinstance(result, str) else Web3.to_hex(result)
            self.save()
        output({"step": step, "hash": entry["transaction_hash"]})
        deadline = time.monotonic()+900
        last_status = None
        while time.monotonic() < deadline:
            receipt = self.rpc("eth_getTransactionByHash", [entry["transaction_hash"]])["result"]
            status = receipt.get("status") if receipt else "NOT_INDEXED"
            if status != last_status:
                output({"step": step, "status": status})
                last_status = status
            if status in ("CANCELED", "UNDETERMINED"):
                entry["status"] = status
                self.save()
                raise RuntimeError(f"{step}: consensus did not finalize; inspect saved hash")
            if status == "FINALIZED":
                succeeded = tx_execution_succeeded(receipt)
                entry.update({"status": status, "execution_succeeded": succeeded,
                              "triggered_transactions": receipt.get("triggered_transactions", []), "finished_at": now()})
                if succeeded == expect_failure:
                    entry["failure_detail"] = receipt.get("consensus_data")
                    self.save()
                    raise RuntimeError(f"{step}: unexpected execution result")
                entry["checked"] = True
                self.save()
                return entry
            time.sleep(5)
        raise RuntimeError(f"{step}: confirmation unknown; resume this journal, never resubmit")

    def check(self, key, actual, expected):
        assert all(actual.get(k) == v for k, v in expected.items()), f"{key}: actual={actual}, expected={expected}"
        self.record["assertions"][key] = {"checked_at": now(), "passed": True, "expected": expected, "actual": actual}
        self.save()

    def wait_until(self, timestamp):
        while time.time() <= timestamp:
            output({"wait_seconds": round(timestamp-time.time()), "reason": "completed incident / retry delay"})
            time.sleep(min(25, max(1, timestamp-time.time()+1)))

    def create(self, name, slots):
        ref = f"outagebond-v02-{self.address[2:10]}-{name}"
        self.write("create-"+name, "create_coverage", ["OutageBond Synthetic API", ref,
            "https://example.com/outagebond-demo", self.origin+"/api/demo-incident", "demo",
            self.accounts["beneficiary"].address, 60, 10, PAYOUT, slots, 3600], value=PAYOUT*slots)
        found = self.read("get_coverage_by_ref", [ref])
        assert found["exists"]
        coverage = self.read("get_coverage", [found["coverage_id"]])
        assert coverage["provider"].lower() == self.accounts["provider"].address.lower()
        self.record["coverages"][name] = coverage["id"]
        self.save()
        return coverage

    def submit(self, name, coverage, duration, *, unreadable=False):
        start = int(coverage["created_at_unix"])+5
        end = start+duration
        self.wait_until(end+31)
        report = ("Synthetic acceptance record. Service: OutageBond Synthetic API, https://example.com/outagebond-demo. "
                  f"Region: demo. Reported event: unplanned complete outage. Start Unix UTC: {start}. End Unix UTC: {end}. Status: recovered.")
        monitor = "https://httpbingo.org/base64/"+quote(base64.b64encode(report.encode()).decode(), safe="")
        operator = f"{self.origin}/api/demo-incident?start={start}&end={end}"
        if unreadable:
            operator = self.origin+"/api/demo-incident"
            monitor = "https://httpbingo.org/status/404"
        assert len(monitor) <= 360
        self.write("submit-"+name, "submit_claim", [coverage["id"], start, end, operator, monitor], role="beneficiary")
        found = self.read("get_claim_for_day", [coverage["id"], start//86400*86400])
        assert found["exists"]
        claim = self.read("get_claim", [found["claim_id"]])
        assert claim["claimant"].lower() == self.accounts["beneficiary"].address.lower()
        assert claim["operator_report_url"] == operator and claim["monitor_report_url"] == monitor
        assert int(claim["incident_start_unix"]) == start and int(claim["incident_end_unix"]) == end
        self.record["claims"][name] = claim["id"]
        self.save()
        return claim["id"]

    def attest_expected(self, name, claim_id, expected):
        for attempt in range(1, 4):
            claim = self.read("get_claim", [claim_id])
            self.record.setdefault("attestation_history", {}).setdefault(name, {})[str(claim["attestation_attempts"])] = claim
            self.save()
            if claim["status"] in (expected, "PAID" if expected == "ELIGIBLE" else expected):
                return claim
            if claim["status"] != "PENDING":
                raise RuntimeError(f"Unexpected terminal verdict: {claim}")
            if int(claim["attestation_attempts"]) >= attempt:
                continue
            self.wait_until(int(claim["attested_at_unix"])+61)
            step = f"attest-{name}" if attempt == 1 else f"attest-{name}-retry-{attempt}"
            self.write(step, "attest", [claim_id], role="observer")
        claim = self.read("get_claim", [claim_id])
        self.record.setdefault("attestation_history", {}).setdefault(name, {})[str(claim["attestation_attempts"])] = claim
        self.save()
        assert claim["status"] == expected, claim
        return claim

    def run(self):
        verify_source(self.client, self.address, (ROOT/"contracts/outage_bond.py").read_text(encoding="utf-8"))
        stats = verify_configuration(self.client, self.address, self.accounts["provider"])
        self.record["preflight"] = {"exact_source_and_config": True, "checked_at": now(), "stats": stats}
        if self.record.get("all_checks_passed"):
            output({"phase": "already-completed", "completed_at": self.record["completed_at"], "new_transactions_sent": False})
            return
        if "funding" not in self.record:
            balance = self.balance(self.accounts["provider"].address)
            if balance < 4*PAYOUT:
                # Studio's public faucet; this account is dedicated solely to test collateral.
                result = self.rpc("sim_fundAccount", [self.accounts["provider"].address, 10*PAYOUT])
                output({"phase": "test-faucet", "result": result.get("result")})
            self.record["funding"] = {"provider_balance_atto": str(self.balance(self.accounts["provider"].address)), "checked_at": now()}
            self.save()
        # Preserve the first inconclusive fixture case and its failed-consensus hash.
        # This new reference never replaces, resubmits, or relabels that old claim.
        eligible_name = "eligible-v2"
        eligible = self.create(eligible_name, 2)
        short = self.create("short", 1)
        unknown = self.create("unverifiable", 1)
        eligible_id = self.submit(eligible_name, eligible, 90)
        claim = self.attest_expected(eligible_name, eligible_id, "ELIGIBLE")
        assert claim["status"] in ("ELIGIBLE", "PAID"), claim
        self.check("eligible-evidence", claim["attestation"], {"outcome": "ELIGIBLE", "intervals_agree": True})
        self.write("unauthorized-payout", "claim_payout", [eligible_id], role="observer", expect_failure=True)
        if "payout_balance_before" not in self.record:
            self.record["payout_balance_before"] = str(self.balance(self.accounts["beneficiary"].address))
            self.save()
        payout = self.write("payout", "claim_payout", [eligible_id], role="beneficiary")
        assert len(payout["triggered_transactions"]) == 1
        child = None
        for _ in range(30):
            child = self.rpc("eth_getTransactionByHash", [payout["triggered_transactions"][0]])["result"]
            if child and child.get("status") == "FINALIZED":
                break
            time.sleep(5)
        assert child and child["status"] == "FINALIZED" and child.get("value_credited") is True
        assert child["from_address"].lower() == self.address.lower()
        assert child["to_address"].lower() == self.accounts["beneficiary"].address.lower() and int(child["value"]) == PAYOUT
        after = self.balance(self.accounts["beneficiary"].address)
        assert after-int(self.record["payout_balance_before"]) == PAYOUT
        self.record["payout_proof"] = {"child_hash": payout["triggered_transactions"][0], "status": "FINALIZED", "value_credited": True,
                                      "value_atto": str(PAYOUT), "recipient": self.accounts["beneficiary"].address,
                                      "before_atto": self.record["payout_balance_before"], "after_atto": str(after)}
        self.check("paid-capacity", self.read("get_coverage", [eligible["id"]]), {
            "paid_claims": "1", "eligible_claims": "0", "pending_claims": "0", "reserved_atto": "0", "available_atto": str(PAYOUT), "can_submit": True})
        self.write("duplicate-payout", "claim_payout", [eligible_id], role="beneficiary", expect_failure=True)
        short_id = self.submit("short", short, 30)
        self.attest_expected("short", short_id, "INELIGIBLE")
        self.check("short-outage", self.read("get_claim", [short_id]), {"status": "INELIGIBLE"})
        self.check("short-collateral", self.read("get_coverage", [short["id"]]), {"reserved_atto": "0", "available_atto": str(PAYOUT)})
        unknown_id = self.submit("unverifiable", unknown, 90, unreadable=True)
        for attempt in range(1, 4):
            saved = self.read("get_claim", [unknown_id])
            if int(saved["attestation_attempts"]) >= attempt:
                continue
            self.wait_until(int(saved["attested_at_unix"])+61)
            self.write(f"attest-unverifiable-{attempt}", "attest", [unknown_id], role="observer")
        self.check("unverifiable-terminal", self.read("get_claim", [unknown_id]), {"status": "UNVERIFIABLE", "attestation_attempts": "3"})
        self.check("unverifiable-collateral", self.read("get_coverage", [unknown["id"]]), {"pending_claims": "0", "reserved_atto": "0", "available_atto": str(PAYOUT)})
        self.record["final_stats"] = self.read("get_stats", [])
        self.record["completed_at"] = now()
        self.record["all_checks_passed"] = True
        self.save()
        output({"phase": "complete", "passed": True, "claims": self.record["claims"], "payout_proof": self.record["payout_proof"]})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True, help="Public OutageBond frontend origin")
    Acceptance(parser.parse_args().origin).run()
