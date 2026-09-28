"""Verify the public ATTEST StudioNet release without acceptance wallet keys."""

from __future__ import annotations

import hashlib
import json
import time
from copy import deepcopy
from pathlib import Path

import requests
from eth_account import Account
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.client.genlayer_client import GenLayerClient
from genlayer_py.types import TransactionHashVariant

from deploy_attest import ROOT, source_digest, verify_config, verify_deployed_source


RPC = "https://studio.genlayer.com/api"
DEPLOYMENT = ROOT / "deployments" / "attest_studionet.json"
HOSTING = ROOT / "deployments" / "attest_vercel.json"
ACCEPTANCE = ROOT / "deployments" / "attest_acceptance.json"


class ReadOnlyVerifier:
    def __init__(self):
        self.deployment = json.loads(DEPLOYMENT.read_text(encoding="utf-8"))
        self.hosting = json.loads(HOSTING.read_text(encoding="utf-8"))
        self.acceptance = json.loads(ACCEPTANCE.read_text(encoding="utf-8"))
        if self.acceptance.get("all_checks_passed") is not True:
            raise RuntimeError("The live acceptance journal is not complete")
        self.address = self.deployment["address"]
        if self.acceptance["contract"].lower() != self.address.lower():
            raise RuntimeError("Acceptance journal refers to another contract")
        if self.hosting["contract_address"].lower() != self.address.lower():
            raise RuntimeError("Hosting manifest refers to another contract")
        if self.hosting["production_url"].rstrip("/") != self.acceptance["frontend_origin"]:
            raise RuntimeError("Acceptance journal refers to another frontend")
        self.account = Account.create()
        self.http = requests.Session()
        self.last_request = 0.0
        self.client = GenLayerClient(deepcopy(studionet), self.account)
        self.client.provider.make_request = self.rpc
        self.client.initialize_consensus_smart_contract()

    def rpc(self, method: str, params: list) -> dict:
        for attempt in range(3):
            time.sleep(max(0.0, 3.0 - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            try:
                response = self.http.post(RPC, json={
                    "jsonrpc": "2.0", "id": int(time.time() * 1000), "method": method, "params": params,
                }, timeout=(10, 60))
                if response.status_code == 429 and attempt < 2:
                    time.sleep(max(10, min(120, int(response.headers.get("Retry-After", "30")))))
                    continue
                response.raise_for_status()
                payload = response.json()
                if payload.get("error"):
                    raise RuntimeError(f"{method}: {payload['error']}")
                return payload
            except requests.RequestException:
                if attempt == 2:
                    raise
                time.sleep(5 * (attempt + 1))
        raise RuntimeError(f"{method}: read retry budget exhausted")

    def read(self, method: str, args: list):
        return self.client.read_contract(
            address=self.address, function_name=method, args=args,
            transaction_hash_variant=TransactionHashVariant.LATEST_FINAL,
        )

    def run(self) -> None:
        source = (ROOT / "contracts" / "attest.py").read_text(encoding="utf-8")
        digest = source_digest(source)
        if digest != self.deployment["source_sha256"] or digest != self.acceptance["source_sha256"]:
            raise RuntimeError("Published source digest differs from the deployed and accepted source")
        verify_deployed_source(self.client, self.address, source)
        verify_config(self.client, self.address, self.account)

        page = self.http.get(self.hosting["production_url"], timeout=30)
        page.raise_for_status()
        if "ATTEST" not in page.text:
            raise RuntimeError("The hosted ATTEST page did not render")

        for step, recorded in self.acceptance["transactions"].items():
            if recorded.get("status") != "FINALIZED" or recorded.get("checked") is not True:
                raise RuntimeError(f"{step}: journal contains a nonfinal write")
            receipt = self.rpc("eth_getTransactionByHash", [recorded["transaction_hash"]])["result"]
            if not receipt or receipt.get("status") != "FINALIZED":
                raise RuntimeError(f"{step}: transaction is not finalized on StudioNet")
            if tx_execution_succeeded(receipt) != recorded["execution_succeeded"]:
                raise RuntimeError(f"{step}: execution success differs from the journal")
            if recorded["execution_succeeded"] == recorded["expect_failure"]:
                raise RuntimeError(f"{step}: execution did not match its expected result")
            if receipt.get("triggered_transactions", []) != recorded.get("triggered_transactions", []):
                raise RuntimeError(f"{step}: triggered transfers differ from the journal")

        outcomes = {"disproven": "DISPROVEN", "inconclusive": "INCONCLUSIVE", "uncontested": "UNCONTESTED"}
        for name, claim_id in self.acceptance["claims"].items():
            current = self.read("get_claim", [claim_id])
            if current != self.acceptance["final_claims"][name]:
                raise RuntimeError(f"{claim_id}: on-chain record differs from the acceptance snapshot")
            if current["status"] != "RESOLVED" or current["outcome"] != outcomes[name]:
                raise RuntimeError(f"{claim_id}: unexpected final outcome")
            sources = {source["id"]: source for source in current["evidence_snapshot"]}
            for source in sources.values():
                if source["status"] == "READABLE" and hashlib.sha256(source["text"].encode("utf-8")).hexdigest() != source["digest"]:
                    raise RuntimeError(f"{claim_id}: stored evidence digest is invalid")
            for citation in current["citations"]:
                source = sources.get(citation["source_id"])
                if source is None or source["status"] != "READABLE":
                    raise RuntimeError(f"{claim_id}: citation refers to an unavailable source")
                lines = source["text"].splitlines()
                if citation["line"] < 1 or citation["line"] > len(lines) or citation["excerpt"] != lines[citation["line"] - 1]:
                    raise RuntimeError(f"{claim_id}: citation does not match the stored source")

        for step, proof in self.acceptance["withdrawal_proof"].items():
            parent = self.acceptance["transactions"][step]
            if parent["triggered_transactions"] != [proof["child_hash"]]:
                raise RuntimeError(f"{step}: journal child transfer differs from its parent")
            child = self.rpc("eth_getTransactionByHash", [proof["child_hash"]])["result"]
            if (not child or child.get("status") != "FINALIZED" or child.get("value_credited") is not True
                    or child.get("from_address", "").lower() != self.address.lower()
                    or child.get("to_address", "").lower() != proof["recipient"].lower()
                    or int(child.get("value", 0)) != int(proof["value_atto"])):
                raise RuntimeError(f"{step}: native transfer proof did not match StudioNet")
            if int(proof["balance_after_atto"]) - int(proof["balance_before_atto"]) != int(proof["value_atto"]):
                raise RuntimeError(f"{step}: recorded recipient balance delta is incorrect")

        if not all(check.get("passed") is True for check in self.acceptance["checks"].values()):
            raise RuntimeError("The acceptance journal contains a failed check")
        print(json.dumps({
            "verified": True, "contract": self.address, "frontend": self.hosting["production_url"],
            "transactions": len(self.acceptance["transactions"]),
            "claims": self.acceptance["claims"],
            "native_withdrawals": len(self.acceptance["withdrawal_proof"]),
        }, indent=2))


if __name__ == "__main__":
    ReadOnlyVerifier().run()
