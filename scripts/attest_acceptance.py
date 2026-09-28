"""Resume-safe StudioNet acceptance for the deployed ATTEST release.

Uses synthetic, project-controlled public evidence and dedicated test wallets.
Private keys stay outside the repository. Every submitted write is journaled
before broadcast and is never blindly resent after a confirmation timeout.
"""

from __future__ import annotations

import argparse
import json
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

from deploy_attest import ROOT, source_digest, verify_config, verify_deployed_source, write_atomic


DEPLOYMENT = ROOT / "deployments" / "attest_studionet.json"
RECORD = ROOT / "deployments" / "attest_acceptance.json"
KEYS = Path.home() / ".codex" / "private" / "attest_acceptance_wallets.json"
RPC = "https://studio.genlayer.com/api"
BOND = 4 * 10**15
COUNTERBOND = 10**15
EXTRA = 10**15


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def output(value: dict) -> None:
    print(json.dumps(value, default=str), flush=True)


class Acceptance:
    def __init__(self, origin: str):
        self.origin = origin.rstrip("/")
        if not self.origin.startswith("https://"):
            raise ValueError("Acceptance requires the public HTTPS app origin")
        self.deployment = json.loads(DEPLOYMENT.read_text(encoding="utf-8"))
        self.address = self.deployment["address"]
        self.source = (ROOT / "contracts" / "attest.py").read_text(encoding="utf-8")
        if source_digest(self.source) != self.deployment["source_sha256"]:
            raise RuntimeError("Local contract source differs from the verified deployment")
        if not KEYS.exists():
            if RECORD.exists():
                raise RuntimeError("Recover the original test wallets before resuming this journal")
            KEYS.parent.mkdir(parents=True, exist_ok=True)
            with KEYS.open("x", encoding="utf-8") as handle:
                json.dump({role: Account.create().key.hex() for role in ("author", "challenger", "observer")}, handle)
        self.accounts = {
            role: Account.from_key(key)
            for role, key in json.loads(KEYS.read_text(encoding="utf-8")).items()
        }
        wallets = {role: account.address for role, account in self.accounts.items()}
        self.record = json.loads(RECORD.read_text(encoding="utf-8")) if RECORD.exists() else {
            "contract": self.address,
            "network": "studionet",
            "frontend_origin": self.origin,
            "source_sha256": self.deployment["source_sha256"],
            "started_at": now(),
            "wallets": wallets,
            "transactions": {},
            "claims": {},
            "checks": {},
            "fixture_disclosure": "The two hosted source files are synthetic and controlled by the ATTEST project. They do not prove independent organizations or a real grant distribution.",
        }
        if (self.record["contract"] != self.address or self.record["frontend_origin"] != self.origin
                or self.record["wallets"] != wallets):
            raise RuntimeError("Saved acceptance context differs from the current deployment or wallets")
        self.http = requests.Session()
        self.last_request = 0.0
        self.active_step = None
        self.client = GenLayerClient(deepcopy(studionet), self.accounts["author"])
        self.client.provider.make_request = self.rpc
        self.client.initialize_consensus_smart_contract()
        self.save()

    def save(self) -> None:
        self.record["updated_at"] = now()
        write_atomic(RECORD, json.dumps(self.record, indent=2, default=str) + "\n")

    def rpc(self, method: str, params: list) -> dict:
        writing = method in ("eth_sendRawTransaction", "sim_fundAccount")
        if method == "eth_sendRawTransaction" and self.active_step:
            entry = self.record["transactions"][self.active_step]
            entry.update({
                "broadcast_attempted": True,
                "evm_transaction_hash": Web3.to_hex(Web3.keccak(hexstr=params[0])),
            })
            self.save()
        for attempt in range(1 if writing else 3):
            time.sleep(max(0, 4.0 - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            try:
                response = self.http.post(RPC, json={
                    "jsonrpc": "2.0", "id": int(time.time() * 1000),
                    "method": method, "params": params,
                }, timeout=(10, 60))
                if response.status_code == 429 and not writing and attempt < 2:
                    delay = max(60, min(3600, int(response.headers.get("Retry-After", "60"))))
                    output({"phase": "rate-limit", "method": method, "retry_after_seconds": delay})
                    time.sleep(delay)
                    continue
                response.raise_for_status()
                payload = response.json()
                if payload.get("error"):
                    raise RuntimeError(f"{method}: {payload['error']}")
                return payload
            except (requests.RequestException, ValueError):
                if writing or attempt == 2:
                    raise
                time.sleep(3 * (attempt + 1))
        raise RuntimeError("RPC retry budget exhausted")

    def read(self, method: str, args: list):
        return self.client.read_contract(
            address=self.address, function_name=method, args=args,
            transaction_hash_variant=TransactionHashVariant.LATEST_FINAL,
        )

    def balance(self, address: str) -> int:
        value = self.rpc("eth_getBalance", [address, "latest"])["result"]
        return int(value, 16) if isinstance(value, str) and value.startswith("0x") else int(value)

    def write(self, step: str, method: str, args: list, *, role: str = "author",
              value: int = 0, expect_failure: bool = False) -> dict:
        intent = {
            "method": method, "args": args, "sender": self.accounts[role].address,
            "value_atto": str(value), "expect_failure": expect_failure,
        }
        entry = self.record["transactions"].get(step)
        if entry:
            if any(entry.get(key) != expected for key, expected in intent.items()):
                raise RuntimeError(f"Saved write intent changed for {step}")
            if entry.get("checked"):
                return entry
        else:
            entry = {**intent, "started_at": now(), "broadcast_attempted": False}
            self.record["transactions"][step] = entry
            self.save()

        self.active_step = step
        self.client.local_account = self.accounts[role]
        if entry.get("broadcast_attempted") and not entry.get("transaction_hash"):
            evm_receipt = self.client.w3.eth.get_transaction_receipt(entry["evm_transaction_hash"])
            consensus = self.client.w3.eth.contract(abi=self.client.chain.consensus_main_contract["abi"])
            events = consensus.get_event_by_name("NewTransaction").process_receipt(evm_receipt, DISCARD)
            if not events:
                raise RuntimeError(f"{step}: broadcast cannot yet be reconciled; no new write was sent")
            entry["transaction_hash"] = Web3.to_hex(events[0]["args"]["txId"])
            self.save()
        if not entry.get("transaction_hash"):
            output({"step": step, "state": "submitting"})
            result = self.client.write_contract(address=self.address, function_name=method, args=args, value=value)
            entry["transaction_hash"] = result if isinstance(result, str) else Web3.to_hex(result)
            self.save()
        output({"step": step, "hash": entry["transaction_hash"]})
        last_status = None
        deadline = time.monotonic() + 900
        while time.monotonic() < deadline:
            receipt = self.rpc("eth_getTransactionByHash", [entry["transaction_hash"]])["result"]
            status = receipt.get("status") if receipt else "NOT_INDEXED"
            if status != last_status:
                output({"step": step, "status": status})
                last_status = status
            if status in ("CANCELED", "UNDETERMINED"):
                entry["status"] = status
                self.save()
                raise RuntimeError(f"{step}: no finalized execution; inspect the saved hash")
            if status == "FINALIZED":
                success = tx_execution_succeeded(receipt)
                entry.update({
                    "status": status, "execution_succeeded": success,
                    "triggered_transactions": receipt.get("triggered_transactions", []),
                    "finished_at": now(),
                })
                self.save()
                if success == expect_failure:
                    raise RuntimeError(f"{step}: unexpected execution result; inspect saved receipt")
                entry["checked"] = True
                self.save()
                return entry
            time.sleep(5)
        raise RuntimeError(f"{step}: confirmation unknown; resume the journal instead of resubmitting")

    def check(self, name: str, actual, expected: dict) -> None:
        previous = self.record["checks"].get(name)
        if previous is not None:
            if previous["expected"] != expected:
                raise RuntimeError(f"Historical check {name} has a different expectation")
            return
        if not isinstance(actual, dict) or any(actual.get(key) != value for key, value in expected.items()):
            raise AssertionError(f"{name}: expected {expected!r}, got {actual!r}")
        self.record["checks"][name] = {"checked_at": now(), "passed": True, "expected": expected, "actual": actual}
        self.save()
        output({"check": name, "passed": True})

    def site_preflight(self) -> None:
        page = self.http.get(self.origin, timeout=30)
        page.raise_for_status()
        if "ATTEST" not in page.text:
            raise RuntimeError("Hosted frontend did not render ATTEST")
        for filename, phrase in (("demo-register.txt", "exactly three unique"),
                                 ("demo-audit.txt", "exactly three unique")):
            response = self.http.get(self.origin + "/evidence/" + filename, timeout=30)
            response.raise_for_status()
            if phrase not in response.text:
                raise RuntimeError(f"Hosted evidence fixture {filename} changed")
        self.record["site_preflight"] = {"checked_at": now(), "status": "public_https_reachable"}
        self.save()

    def fund(self, role: str, minimum: int, amount: int) -> None:
        address = self.accounts[role].address
        before = self.balance(address)
        if before < minimum:
            self.rpc("sim_fundAccount", [address, amount])
        after = self.balance(address)
        if after < minimum:
            raise RuntimeError(f"StudioNet test faucet did not fund {role}")
        self.record.setdefault("funding", {})[role] = {
            "checked_at": now(), "balance_before_atto": str(before), "balance_after_atto": str(after),
            "faucet_used": before < minimum,
        }
        self.save()

    def find_claim(self, title: str, author: str) -> dict:
        offset = 0
        matches = []
        while True:
            page = self.read("list_claims", [offset, 50])
            matches.extend(item for item in page["items"] if item["title"] == title and item["author"].lower() == author.lower())
            offset += len(page["items"])
            if offset >= int(page["total"]) or not page["items"]:
                break
        if len(matches) != 1:
            raise RuntimeError(f"Expected one finalized claim with title {title!r}; found {len(matches)}")
        return self.read("get_claim", [matches[0]["id"]])

    def create(self, name: str, statement: str, rule: str, url: str) -> dict:
        title = "ATTEST synthetic acceptance " + self.address[2:10] + " " + name
        self.write("create-" + name, "create_claim", [title, statement, rule, json.dumps([url]), 3600, BOND])
        claim = self.find_claim(title, self.accounts["author"].address)
        self.record["claims"][name] = claim["id"]
        self.save()
        self.check("created-" + name, claim, {
            "status": "OPEN", "title": title, "bond_atto": str(BOND),
            "source_urls": [url],
        })
        return claim

    def wait_until(self, timestamp: int) -> None:
        while time.time() < timestamp:
            remaining = timestamp - time.time()
            output({"phase": "waiting-for-review-deadline", "seconds_remaining": round(remaining)})
            time.sleep(min(30, max(1, remaining + 1)))

    def verify_transfer(self, step: str, recipient: str, amount: int, before: int) -> None:
        parent = self.record["transactions"][step]
        children = parent["triggered_transactions"]
        if len(children) != 1:
            raise AssertionError(f"{step}: expected exactly one native child transfer")
        child = None
        for _ in range(30):
            child = self.rpc("eth_getTransactionByHash", [children[0]])["result"]
            if child and child.get("status") == "FINALIZED":
                break
            time.sleep(5)
        if (not child or child.get("value_credited") is not True
                or child.get("from_address", "").lower() != self.address.lower()
                or child.get("to_address", "").lower() != recipient.lower()
                or int(child.get("value", 0)) != amount):
            raise AssertionError(f"{step}: native child transfer did not credit the expected recipient and value")
        after = self.balance(recipient)
        if after - before != amount:
            raise AssertionError(f"{step}: recipient balance changed by {after - before}, expected {amount}")
        self.record.setdefault("withdrawal_proof", {})[step] = {
            "parent_hash": parent["transaction_hash"], "child_hash": children[0],
            "recipient": recipient, "value_atto": str(amount), "value_credited": True,
            "balance_before_atto": str(before), "balance_after_atto": str(after),
        }
        self.save()
        output({"transfer": step, "passed": True, "value_atto": str(amount)})

    def run(self) -> None:
        verify_deployed_source(self.client, self.address, self.source)
        verify_config(self.client, self.address, self.accounts["author"])
        self.site_preflight()
        if self.record.get("all_checks_passed"):
            output({"phase": "already-complete", "new_writes_sent": False})
            return

        self.fund("author", 3 * BOND + EXTRA, 3 * BOND + 10 * EXTRA)
        self.fund("challenger", 2 * COUNTERBOND, 10 * COUNTERBOND)
        self.write("deposit-author", "deposit", [], value=3 * BOND + EXTRA)
        self.write("deposit-challenger", "deposit", [], role="challenger", value=2 * COUNTERBOND)
        self.check("initial-author-credit", {"credit": self.read("get_credit", [self.accounts["author"].address])},
                   {"credit": str(3 * BOND + EXTRA)})
        self.check("initial-challenger-credit", {"credit": self.read("get_credit", [self.accounts["challenger"].address])},
                   {"credit": str(2 * COUNTERBOND)})

        self.write("invalid-post", "create_claim", [
            "ATTEST invalid source check", "This failed synthetic claim must leave its GEN deposit available for withdrawal.",
            "A claim with a local evidence URL must be rejected before any bond credit is locked.",
            json.dumps(["https://localhost/private"]), 3600, BOND,
        ], expect_failure=True)
        self.check("failed-post-credit-recoverable", {"credit": self.read("get_credit", [self.accounts["author"].address])},
                   {"credit": str(3 * BOND + EXTRA)})

        register = self.origin + "/evidence/demo-register.txt"
        audit = self.origin + "/evidence/demo-audit.txt"
        missing = self.origin + "/evidence/does-not-exist.txt"
        disproven = self.create(
            "disproven",
            "The ATTEST synthetic October 2026 grant register lists four unique recipients, each assigned a nonzero test GEN amount.",
            "DISPROVEN if the published synthetic October 2026 register and audit show fewer than four unique recipient addresses; SUPPORTED only if four unique addresses with nonzero amounts are shown; otherwise INCONCLUSIVE.",
            register,
        )
        self.write("challenge-disproven", "challenge", [
            disproven["id"],
            "The project-controlled synthetic register and audit both show exactly three unique recipients, not four.",
            json.dumps([audit]),
        ], role="challenger")
        self.check("challenged-disproven", self.read("get_claim", [disproven["id"]]), {"status": "CHALLENGED"})

        inconclusive = self.create(
            "inconclusive",
            "The unavailable ATTEST synthetic record lists four unique recipients with nonzero test GEN amounts.",
            "SUPPORTED only if the declared record shows four unique paid addresses; DISPROVEN only if readable evidence establishes fewer than four; otherwise INCONCLUSIVE.",
            missing,
        )
        self.write("challenge-inconclusive", "challenge", [
            inconclusive["id"], "The declared synthetic source is missing, and there is no readable record to assess.",
            json.dumps([missing + "?challenge=1"]),
        ], role="challenger")
        self.check("challenged-inconclusive", self.read("get_claim", [inconclusive["id"]]), {"status": "CHALLENGED"})

        uncontested = self.create(
            "uncontested",
            "The ATTEST synthetic October 2026 grant register lists three unique recipients with nonzero test GEN amounts.",
            "SUPPORTED only if the published synthetic register shows three unique addresses with nonzero amounts; DISPROVEN if it shows a different count; otherwise INCONCLUSIVE.",
            register,
        )
        deadlines = [int(self.read("get_claim", [claim["id"]])["challenge_deadline"])
                     for claim in (disproven, inconclusive, uncontested)]
        self.record["review_deadlines"] = dict(zip(("disproven", "inconclusive", "uncontested"), deadlines))
        self.save()
        self.wait_until(max(deadlines) + 3)

        self.write("resolve-disproven", "resolve", [disproven["id"]], role="observer")
        resolved = self.read("get_claim", [disproven["id"]])
        self.check("disproven-verdict", resolved, {"status": "RESOLVED", "outcome": "DISPROVEN"})
        if not resolved["citations"] or not all(c["excerpt"] in s["text"] for c in resolved["citations"]
                                                for s in resolved["evidence_snapshot"] if c["source_id"] == s["id"]):
            raise AssertionError("DISPROVEN verdict lacked verifiable snapshot citations")
        self.write("resolve-inconclusive", "resolve", [inconclusive["id"]], role="observer")
        self.check("inconclusive-verdict", self.read("get_claim", [inconclusive["id"]]),
                   {"status": "RESOLVED", "outcome": "INCONCLUSIVE"})
        self.write("finalize-uncontested", "finalize_uncontested", [uncontested["id"]], role="observer")
        self.check("uncontested-refund", self.read("get_claim", [uncontested["id"]]),
                   {"status": "RESOLVED", "outcome": "UNCONTESTED"})

        author_credit = 2 * BOND + EXTRA
        challenger_credit = BOND + 2 * COUNTERBOND
        self.check("author-credit-conserved", {"credit": self.read("get_credit", [self.accounts["author"].address])},
                   {"credit": str(author_credit)})
        self.check("challenger-credit-conserved", {"credit": self.read("get_credit", [self.accounts["challenger"].address])},
                   {"credit": str(challenger_credit)})
        self.check("final-stats", self.read("get_stats", []), {
            "total_created": "3", "total_challenged": "2", "total_disproven": "1",
            "total_inconclusive": "1", "total_locked_atto": "0",
            "total_settled_atto": str(3 * BOND + 2 * COUNTERBOND),
        })

        for role, amount in (("author", author_credit), ("challenger", challenger_credit)):
            step = "withdraw-" + role
            account = self.accounts[role]
            key = "withdrawal_balance_before_" + role
            if key not in self.record:
                self.record[key] = str(self.balance(account.address))
                self.save()
            self.write(step, "withdraw_credit", [], role=role)
            self.verify_transfer(step, account.address, amount, int(self.record[key]))
            self.check(role + "-credit-cleared", {"credit": self.read("get_credit", [account.address])}, {"credit": "0"})

        self.record["final_claims"] = {name: self.read("get_claim", [claim_id])
                                       for name, claim_id in self.record["claims"].items()}
        self.record["final_stats"] = self.read("get_stats", [])
        self.record["all_checks_passed"] = True
        self.record["completed_at"] = now()
        self.save()
        output({"phase": "complete", "passed": True, "claims": self.record["claims"],
                "withdrawal_proof": self.record["withdrawal_proof"]})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True, help="Public ATTEST frontend origin")
    Acceptance(parser.parse_args().origin).run()
