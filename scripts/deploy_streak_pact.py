"""Deploy StreakPact to a GenLayer network and record the deployment.

Usage:
    python scripts/deploy_streak_pact.py [fee_bps] [period_secs]

Env:
    STREAKPACT_PRIVATE_KEY  deployer key; a fresh keypair is generated if unset
    STREAKPACT_NETWORK      studionet (default) | localnet

Writes deployments/streak_pact_<network>.json on success.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import localnet, studionet

ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = ROOT / "contracts" / "streak_pact.py"
DEPLOYMENTS_DIR = ROOT / "deployments"


def extract_contract_address(receipt: dict) -> str:
    if "tx_data_decoded" in receipt and "contract_address" in receipt["tx_data_decoded"]:
        return receipt["tx_data_decoded"]["contract_address"]
    if "data" in receipt and "contract_address" in receipt["data"]:
        return receipt["data"]["contract_address"]
    raise ValueError(f"receipt missing contract address: {json.dumps(receipt)[:400]}")


def main() -> None:
    fee_bps = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    period_secs = int(sys.argv[2]) if len(sys.argv) > 2 else 86400

    network_name = os.environ.get("STREAKPACT_NETWORK", "studionet")
    chain = {"studionet": studionet, "localnet": localnet}[network_name]

    private_key = os.environ.get("STREAKPACT_PRIVATE_KEY")
    account = Account.from_key(private_key) if private_key else Account.create()

    code = CODE_PATH.read_text(encoding="utf-8")
    client = create_client(chain=chain)

    print(f"network={network_name} deployer={account.address} fee_bps={fee_bps} period_secs={period_secs}")
    tx_hash = client.deploy_contract(code=code, account=account, args=[fee_bps, period_secs])
    print(f"tx={tx_hash}")

    receipt = client.wait_for_transaction_receipt(transaction_hash=tx_hash)
    address = extract_contract_address(receipt)
    print(f"deployed StreakPact at {address}")

    DEPLOYMENTS_DIR.mkdir(exist_ok=True)
    record = {
        "contract": "StreakPact",
        "network": network_name,
        "address": address,
        "transaction_hash": str(tx_hash),
        "deployer": account.address,
        "constructor_args": {"fee_bps": fee_bps, "period_secs": period_secs},
        "deployed_at": datetime.now(timezone.utc).isoformat(),
    }
    out_path = DEPLOYMENTS_DIR / f"streak_pact_{network_name}.json"
    out_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
