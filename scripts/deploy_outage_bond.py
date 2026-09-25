"""Preflight, deploy, verify, and activate OutageBond on GenLayer StudioNet.

Use OUTAGEBOND_PRIVATE_KEY for a dedicated recoverable signer, or
--ephemeral-studionet-deployer for a disposable StudioNet-only deployer. The
contract has no admin role, constructor configuration, or protocol fee.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from getpass import getpass
from pathlib import Path

from eth_account import Account
from eth_utils import to_checksum_address
from genlayer_py import create_client
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionHashVariant, TransactionStatus

ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = ROOT / "contracts" / "outage_bond.py"
TEST_PATH = ROOT / "tests" / "direct" / "test_outage_bond.py"
DEPLOYMENT_PATH = ROOT / "deployments" / "outage_bond_studionet.json"
FRONTEND_ENV = ROOT / "apps" / "outagebond-web" / ".env.local"
ADDRESS_PATTERN = re.compile(r"^0x[0-9a-fA-F]{40}$")
TX_PATTERN = re.compile(r"^0x[0-9a-fA-F]{64}$")
VERSION = "0.2.0-studionet"


def source_digest(source: str) -> str:
    return hashlib.sha256(source.replace("\r\n", "\n").encode("utf-8")).hexdigest()


def run_preflight() -> None:
    environment = os.environ.copy()
    environment["PYTHONUTF8"] = "1"
    subprocess.run(["genvm-lint", "check", str(CODE_PATH)], cwd=ROOT, check=True, env=environment)
    subprocess.run([sys.executable, "-m", "pytest", str(TEST_PATH), str(TEST_PATH.with_name("test_outage_bond_regressions.py")), "-v"], cwd=ROOT, check=True, env=environment)


def assert_success(receipt: dict) -> None:
    status = receipt.get("status_name") or receipt.get("statusName")
    if status != TransactionStatus.FINALIZED.value or not tx_execution_succeeded(receipt):
        raise RuntimeError("deployment did not finalize with successful execution")


def extract_address(receipt: dict) -> str:
    for key in ("tx_data_decoded", "data"):
        result = receipt.get(key)
        if isinstance(result, dict) and result.get("contract_address"):
            address = str(result["contract_address"])
            if ADDRESS_PATTERN.fullmatch(address) is None or int(address[2:], 16) == 0:
                raise RuntimeError("deployment receipt contained an invalid contract address")
            return to_checksum_address(address)
    raise RuntimeError("finalized deployment receipt did not contain a contract address")


def verify_source(client, address: str, expected_source: str) -> str:
    response = client.provider.make_request(method="gen_getContractCode", params=[address])
    encoded = response.get("result")
    if not isinstance(encoded, str):
        raise RuntimeError("could not retrieve deployed contract source")
    try:
        actual_source = base64.b64decode(encoded, validate=True).decode("utf-8")
    except (ValueError, UnicodeError):
        raise RuntimeError("deployed source was not valid base64-encoded Python") from None
    expected_digest = source_digest(expected_source)
    if source_digest(actual_source) != expected_digest:
        raise RuntimeError("deployed source differs from the preflighted local source")
    return expected_digest


def verify_configuration(client, address: str, account) -> dict:
    stats = client.read_contract(
        address=address,
        function_name="get_stats",
        args=[],
        account=account,
        transaction_hash_variant=TransactionHashVariant.LATEST_FINAL,
    )
    expected = {
        "version": VERSION,
        "network_scope": "STUDIONET_TEST_GEN_NO_MONETARY_VALUE",
        "admin_controls": False,
        "fee_bps": "0",
        "source_policy": "TWO_DISTINCT_HTTPS_HOSTS_INDEPENDENT_EXTRACTION_AND_VERDICT",
        "max_source_bytes": "12000",
        "max_claims_per_coverage": "10",
        "claim_grace_secs": str(7 * 24 * 60 * 60),
        "payout_claim_secs": str(30 * 24 * 60 * 60),
        "attestation_window_secs": "86400",
        "incident_policy": "COVERED_INTERVAL_AND_ALL_TOUCHED_UTC_DAYS",
    }
    if not isinstance(stats, dict) or any(stats.get(key) != value for key, value in expected.items()):
        raise RuntimeError("deployed configuration does not match the OutageBond release")
    return stats


def atomic_json(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     prefix="outagebond-record-", suffix=".json.tmp", delete=False) as temporary:
        json.dump(record, temporary, indent=2)
        temporary.write("\n")
        staged = Path(temporary.name)
    staged.replace(path)


def record_deployment(record: dict) -> None:
    if DEPLOYMENT_PATH.exists():
        previous = json.loads(DEPLOYMENT_PATH.read_text(encoding="utf-8"))
        previous_address = str(previous.get("address", ""))
        if previous_address.lower() != record["address"].lower():
            if ADDRESS_PATTERN.fullmatch(previous_address) is None:
                raise RuntimeError("existing deployment record has an invalid address; refusing to replace it")
            history_dir = DEPLOYMENT_PATH.parent / "history"
            history_path = history_dir / f"outage_bond_studionet_{previous_address[2:].lower()}.json"
            if history_path.exists():
                if json.loads(history_path.read_text(encoding="utf-8")) != previous:
                    raise RuntimeError("existing deployment history differs; refusing to overwrite it")
            else:
                atomic_json(history_path, previous)
            record["previous_address"] = previous_address
    atomic_json(DEPLOYMENT_PATH, record)


def update_frontend_env(address: str) -> None:
    values = {
        "NEXT_PUBLIC_OUTAGEBOND_ADDRESS": address,
        "NEXT_PUBLIC_NETWORK_NAME": "StudioNet",
    }
    lines = FRONTEND_ENV.read_text(encoding="utf-8").splitlines() if FRONTEND_ENV.exists() else []
    remaining = dict(values)
    updated = []
    for line in lines:
        key = line.split("=", 1)[0] if "=" in line else ""
        if key in remaining:
            updated.append(f"{key}={remaining.pop(key)}")
        else:
            updated.append(line)
    updated.extend(f"{key}={value}" for key, value in remaining.items())
    FRONTEND_ENV.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=FRONTEND_ENV.parent,
                                     prefix="outagebond-env-", suffix=".tmp", delete=False) as temporary:
        temporary.write("\n".join(updated) + "\n")
        staged = Path(temporary.name)
    staged.replace(FRONTEND_ENV)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ephemeral-studionet-deployer", action="store_true",
                        help="use an in-memory, deployment-only signer on gasless StudioNet")
    parser.add_argument("--resume-transaction", help="verify an already-submitted deployment transaction")
    parser.add_argument("--skip-preflight", action="store_true", help="local debugging only; not for release deployments")
    args = parser.parse_args()

    network_name = os.environ.get("OUTAGEBOND_NETWORK", "studionet").strip().lower()
    if network_name != "studionet":
        parser.error("This release script only writes StudioNet records; OUTAGEBOND_NETWORK must be studionet")
    if args.ephemeral_studionet_deployer and network_name != "studionet":
        parser.error("an ephemeral deployer is only supported on StudioNet")
    if args.resume_transaction and TX_PATTERN.fullmatch(args.resume_transaction) is None:
        parser.error("--resume-transaction must be a 32-byte transaction hash")

    if args.resume_transaction:
        account = Account.create()  # Read-only context; never broadcast on resume.
        signer_mode = "resumed_existing_transaction"
    elif args.ephemeral_studionet_deployer:
        account = Account.create()
        signer_mode = "disposable_studionet_deployment_only"
    else:
        private_key = os.environ.get("OUTAGEBOND_PRIVATE_KEY") or getpass(
            "Enter the dedicated OutageBond deployment key (input hidden): "
        ).strip()
        if not private_key:
            raise RuntimeError("OUTAGEBOND_PRIVATE_KEY is required; no key will be generated")
        try:
            account = Account.from_key(private_key)
        except (TypeError, ValueError):
            raise RuntimeError("private key format is invalid") from None
        del private_key
        signer_mode = "dedicated_recoverable_signer"

    if not args.skip_preflight:
        run_preflight()
    source = CODE_PATH.read_text(encoding="utf-8")
    client = create_client(chain=studionet, account=account)
    print(f"network={network_name} deployer={account.address} source_sha256={source_digest(source)}", flush=True)
    transaction_hash = args.resume_transaction or client.deploy_contract(code=source, account=account, args=[])
    print(f"transaction={transaction_hash}", flush=True)
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=transaction_hash,
        status=TransactionStatus.FINALIZED,
        interval=3000,
        retries=120,
        full_transaction=True,
    )
    assert_success(receipt)
    address = extract_address(receipt)
    digest = verify_source(client, address, source)
    stats = verify_configuration(client, address, account)
    record = {
        "contract": "OutageBond",
        "version": VERSION,
        "network": network_name,
        "address": address,
        "transaction_hash": str(transaction_hash),
        "deployer": str(receipt.get("from_address") or receipt.get("from") or account.address),
        "deployer_role": "no_admin_controls_or_protocol_fees",
        "signer_mode": signer_mode,
        "constructor_args": [],
        "source_sha256": digest,
        "runner_dependency": source.splitlines()[0],
        "receipt_status": "FINALIZED",
        "execution_result": "SUCCESS",
        "verified_source_and_config": True,
        "preflight_passed": not args.skip_preflight,
        "deployed_stats": stats,
        "deployed_at": datetime.now(timezone.utc).isoformat(),
    }
    record_deployment(record)
    update_frontend_env(address)
    print(f"verified_deployment={address}", flush=True)
    print(f"record={DEPLOYMENT_PATH}", flush=True)
    print(f"frontend_env={FRONTEND_ENV}", flush=True)


if __name__ == "__main__":
    main()
