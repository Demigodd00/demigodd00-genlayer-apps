"""Seed the exact Hackathon Judge v2.2 StudioNet release with a public demo.

The organizer uses HACKATHON_JUDGE_DEMO_PRIVATE_KEY when supplied, otherwise
the existing local StudioNet signer. Entrants are deterministically derived and
their keys are never written to disk. All currency is simulated StudioNet GEN.
"""

import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from eth_account import Account
from genlayer_py import create_client
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionHashVariant, TransactionStatus


ROOT = Path(__file__).resolve().parents[1]
DEPLOYMENT_PATH = ROOT / "deployments" / "hackathon_judge_studionet.json"
RECORD_PATH = ROOT / "deployments" / "hackathon_judge_demo.json"
HISTORY_DIR = ROOT / "deployments" / "history"
ENV_PATH = ROOT / ".env"
SITE_URL = "https://hackathon-judge-studionet.blazekingsley2.chatgpt.site"
EVENT_NAME = "Open Intelligence Build Week — Verified Jury Final"
PRIZE = 10**15
FINAL = TransactionStatus.FINALIZED


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_signer() -> str:
    direct = os.environ.get("HACKATHON_JUDGE_DEMO_PRIVATE_KEY", "").strip()
    if direct:
        return direct
    if ENV_PATH.exists():
        for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == "STREAKPACT_PRIVATE_KEY" and value.strip():
                return value.strip().strip('"').strip("'")
    raise RuntimeError("Set HACKATHON_JUDGE_DEMO_PRIVATE_KEY or configure the existing StudioNet signer")


def _save(record: dict) -> None:
    record["updated_at"] = _timestamp()
    payload = json.dumps(record, indent=2, default=str) + "\n"
    last_error = None
    for attempt in range(8):
        pending = RECORD_PATH.with_name(f"{RECORD_PATH.name}.{os.getpid()}.{attempt}.tmp")
        pending.write_text(payload, encoding="utf-8")
        try:
            pending.replace(RECORD_PATH)
            stale = RECORD_PATH.with_suffix(".json.tmp")
            try:
                stale.unlink(missing_ok=True)
            except PermissionError:
                pass
            return
        except PermissionError as exc:
            last_error = exc
            pending.unlink(missing_ok=True)
            time.sleep(0.25 * (attempt + 1))
    raise RuntimeError("Could not atomically update the demo receipt after repeated Windows file locks") from last_error


def _load_or_start_record(address: str, accounts: dict) -> dict:
    if RECORD_PATH.exists():
        previous = json.loads(RECORD_PATH.read_text(encoding="utf-8"))
        if previous.get("contract", "").lower() == address.lower() and previous.get("event_name") == EVENT_NAME:
            return previous
        previous_address = previous.get("contract", "unknown").replace("0x", "").lower()
        previous_event = previous.get("hackathon_id", "unassigned").replace("/", "-")
        HISTORY_DIR.mkdir(parents=True, exist_ok=True)
        history_path = HISTORY_DIR / f"hackathon_judge_demo_{previous_address}_{previous_event}.json"
        if history_path.exists():
            if json.loads(history_path.read_text(encoding="utf-8")) != previous:
                raise RuntimeError("Existing demo history differs; refusing to overwrite it")
        else:
            history_path.write_text(json.dumps(previous, indent=2) + "\n", encoding="utf-8")
    return {
        "network": "studionet",
        "contract": address,
        "contract_version": "2.2.0",
        "site_url": SITE_URL,
        "event_name": EVENT_NAME,
        "started_at": _timestamp(),
        "wallets": {name: account.address for name, account in accounts.items()},
        "transactions": {},
        "assertions": {},
    }


def _close_partial_demo(record: dict, clients: dict, address: str) -> None:
    hackathon_id = record.get("hackathon_id")
    if not hackathon_id:
        listing = _read(clients["organizer"], address, "list_hackathons", [0, 25])
        matching = [item for item in listing["items"] if item["name"] == record.get("event_name")]
        if len(matching) != 1:
            return
        hackathon_id = matching[0]["id"]
        record["hackathon_id"] = hackathon_id
        _save(record)
    organizer_client = clients["organizer"]
    event = _read(organizer_client, address, "get_hackathon", [hackathon_id])
    if event["status"] in ("FINALIZED", "NO_WINNER", "CANCELLED"):
        return
    if event["status"] == "OPEN" and event["submission_count"] == "0":
        _write(
            record,
            clients,
            address,
            f"recovery_cancel_{hackathon_id}",
            "organizer",
            "cancel_hackathon",
            [hackathon_id],
        )
        record["recovery_status"] = "CANCELLED"
        _save(record)
        return
    submissions = _read(organizer_client, address, "list_submissions", [hackathon_id, 0, 25])["items"]
    for item in submissions:
        if item["status"] == "SUBMITTED":
            _write(
                record,
                clients,
                address,
                f"recovery_evaluate_{hackathon_id}_{item['index']}",
                "organizer",
                "evaluate_submission",
                [hackathon_id, int(item["index"])],
            )
    submissions = _read(organizer_client, address, "list_submissions", [hackathon_id, 0, 25])["items"]
    appeal_deadlines = [int(item["appeal_deadline_unix"]) for item in submissions if item["appealable"]]
    if appeal_deadlines:
        _wait_until(max(appeal_deadlines))
    event = _read(organizer_client, address, "get_hackathon", [hackathon_id])
    if event["finalizable"]:
        _write(
            record,
            clients,
            address,
            f"recovery_finalize_{hackathon_id}",
            "organizer",
            "finalize_hackathon",
            [hackathon_id],
        )
        event = _read(organizer_client, address, "get_hackathon", [hackathon_id])
    if event["status"] == "FINALIZED" and event["winner"]:
        winner_role = next(
            name
            for name, client in clients.items()
            if client.local_account.address.lower() == event["winner"].lower()
        )
        credit = int(_read(clients[winner_role], address, "get_credit", [event["winner"]]))
        if credit:
            _write(record, clients, address, f"recovery_withdraw_{hackathon_id}", winner_role, "withdraw_credit", [])
    record["recovery_status"] = event["status"]
    _save(record)


def _output(value: dict) -> None:
    print(json.dumps(value, default=str), flush=True)


def _read(client, address: str, method: str, args: list):
    return client.read_contract(
        address=address,
        function_name=method,
        args=args,
        transaction_hash_variant=TransactionHashVariant.LATEST_FINAL,
    )


def _write(record: dict, clients: dict, address: str, step: str, role: str, method: str, args: list, value: int = 0) -> dict:
    existing = record["transactions"].get(step)
    if existing and existing.get("execution_succeeded"):
        _output({"step": step, "state": "already_finalized", "transaction_hash": existing["transaction_hash"]})
        return existing
    client = clients[role]
    _output({"step": step, "state": "submitting", "method": method, "role": role})
    tx_hash = client.write_contract(address=address, function_name=method, args=args, value=value)
    tx_hash = str(tx_hash)
    record["transactions"][step] = {
        "method": method,
        "args": args,
        "role": role,
        "sender": client.local_account.address,
        "value_atto": str(value),
        "transaction_hash": tx_hash,
        "submitted_at": _timestamp(),
    }
    _save(record)
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        status=FINAL,
        interval=3000,
        retries=180,
        full_transaction=True,
    )
    success = tx_execution_succeeded(receipt)
    record["transactions"][step].update({
        "status": receipt.get("status_name") or receipt.get("statusName"),
        "execution_succeeded": success,
        "finalized_at": _timestamp(),
    })
    _save(record)
    if not success:
        raise RuntimeError(f"{step} finalized with a contract execution failure")
    _output({"step": step, "state": "finalized", "transaction_hash": tx_hash})
    return record["transactions"][step]


def _wait_until(deadline: int) -> None:
    while time.time() <= deadline + 2:
        remaining = max(0, deadline + 2 - int(time.time()))
        _output({"phase": "deadline_wait", "remaining_seconds": remaining})
        time.sleep(min(30, max(1, remaining)))


def main() -> None:
    deployment = json.loads(DEPLOYMENT_PATH.read_text(encoding="utf-8"))
    if deployment.get("network") != "studionet" or deployment.get("version") != "2.2.0":
        raise RuntimeError("The recorded Hackathon Judge v2.2 StudioNet release is not active")
    address = deployment["address"]
    organizer = Account.from_key(_load_signer())
    entrant_one = Account.from_key(hmac.new(organizer.key, b"hackathon-judge/demo/entrant-one/v2", hashlib.sha256).digest())
    entrant_two = Account.from_key(hmac.new(organizer.key, b"hackathon-judge/demo/entrant-two/v2", hashlib.sha256).digest())
    accounts = {"organizer": organizer, "entrant_one": entrant_one, "entrant_two": entrant_two}
    clients = {name: create_client(chain=studionet, account=account) for name, account in accounts.items()}

    if RECORD_PATH.exists():
        previous = json.loads(RECORD_PATH.read_text(encoding="utf-8"))
        if previous.get("contract", "").lower() == address.lower() and previous.get("event_name") != EVENT_NAME:
            _close_partial_demo(previous, clients, address)

    record = _load_or_start_record(address, accounts)
    _save(record)

    organizer_client = clients["organizer"]
    config = _read(organizer_client, address, "get_config", [])
    if (
        config.get("version") != "2.2.0"
        or config.get("evidence_schema") != "hackathon-judge-snapshot-v3"
        or config.get("evaluation_schema") != "hackathon-judge-evaluation-v1"
    ):
        raise RuntimeError("Deployed configuration does not match the demo")

    listing = _read(organizer_client, address, "list_hackathons", [0, 25])
    matching = [item for item in listing["items"] if item["name"] == EVENT_NAME]
    if not matching:
        _output({"phase": "funding", "address": organizer.address, "amount_atto": str(PRIZE * 2)})
        funding = organizer_client.fund_account(organizer.address, PRIZE * 2)
        funding_hash = "0x" + bytes(funding).hex()
        funding_receipt = organizer_client.wait_for_transaction_receipt(funding_hash, status=FINAL, interval=3000, retries=120)
        if (funding_receipt.get("status_name") or funding_receipt.get("statusName")) != FINAL.value:
            raise RuntimeError("StudioNet demo funding did not finalize")
        record["funding_transaction_hash"] = funding_hash
        _save(record)
        _write(record, clients, address, "deposit_prize", "organizer", "deposit", [], PRIZE)
        deadline = int(time.time()) + 480
        record["submission_deadline_unix"] = deadline
        _save(record)
        _write(record, clients, address, "create_event", "organizer", "create_hackathon", [
            EVENT_NAME,
            "Best Verifiable Agent",
            (
                "Projects must be newly built during this event and provide all of these exact public identifiers: "
                "a GenLayer StudioNet contract address, its deployment transaction hash, the public contract source URL, "
                "and the live application URL. Missing identifiers are inconclusive; clear pre-existing work is ineligible."
            ),
            (
                "Score 100 when every required exact identifier is present and the evidence explains the complete consensus, "
                "appeal, and settlement flow. Score 80 when all identifiers are supplied only through a valid appeal. "
                "Missing identifiers must receive zero and INCONCLUSIVE; a clear build-window violation is INELIGIBLE."
            ),
            deadline,
            3,
            60,
            60,
            PRIZE,
        ])
        listing = _read(organizer_client, address, "list_hackathons", [0, 25])
        matching = [item for item in listing["items"] if item["name"] == EVENT_NAME]
    if len(matching) != 1:
        raise RuntimeError("Could not resolve a unique live demo hackathon")
    hackathon_id = matching[0]["id"]
    record["hackathon_id"] = hackathon_id
    _save(record)

    event = _read(organizer_client, address, "get_hackathon", [hackathon_id])
    submission_page = _read(organizer_client, address, "list_submissions", [hackathon_id, 0, 25])
    by_entrant = {item["entrant"].lower(): item for item in submission_page["items"]}
    if entrant_one.address.lower() not in by_entrant:
        _write(record, clients, address, "submit_hackathon_judge", "entrant_one", "submit_project", [
            hackathon_id,
            "Hackathon Judge Protocol",
            SITE_URL + "/evidence/hackathon-judge-protocol.txt",
            "The live GenLayer-native judging protocol with exact public source, deployment, and reproducibility evidence.",
        ])
    if entrant_two.address.lower() not in by_entrant:
        _write(record, clients, address, "submit_appeal_fixture", "entrant_two", "submit_project", [
            hackathon_id,
            "Appeal Recovery Fixture",
            SITE_URL + "/evidence/appeal-recovery-fixture.txt",
            "A deliberate evidence-gap fixture used to prove that missing identifiers become inconclusive and can be repaired once through appeal.",
        ])

    event = _read(organizer_client, address, "get_hackathon", [hackathon_id])
    deadline = int(event["submission_deadline_unix"])
    if time.time() <= deadline + 2:
        _wait_until(deadline)

    submissions = _read(organizer_client, address, "list_submissions", [hackathon_id, 0, 25])["items"]
    for item in submissions:
        if item["status"] == "SUBMITTED":
            _write(record, clients, address, f"evaluate_{item['index']}", "organizer", "evaluate_submission", [hackathon_id, int(item["index"])])

    submissions = _read(organizer_client, address, "list_submissions", [hackathon_id, 0, 25])["items"]
    appeal_fixture = next(item for item in submissions if item["entrant"].lower() == entrant_two.address.lower())
    if appeal_fixture["appealable"]:
        _write(record, clients, address, "appeal_recovery_fixture", "entrant_two", "appeal_submission", [
            hackathon_id,
            int(appeal_fixture["index"]),
            "The original fixture intentionally omitted the deployment transaction. This addendum supplies that exact public identifier and the complete reproducibility record required by the rulebook.",
            SITE_URL + "/evidence/appeal-recovery-fixture-addendum.txt",
        ])
        appeal_fixture = _read(organizer_client, address, "get_submission", [hackathon_id, int(appeal_fixture["index"])])
    if appeal_fixture["appeal_resolvable"]:
        _write(record, clients, address, "resolve_recovery_fixture_appeal", "organizer", "resolve_appeal", [hackathon_id, int(appeal_fixture["index"])])

    event = _read(organizer_client, address, "get_hackathon", [hackathon_id])
    if event["finalizable"]:
        _write(record, clients, address, "finalize_event", "organizer", "finalize_hackathon", [hackathon_id])
        event = _read(organizer_client, address, "get_hackathon", [hackathon_id])
    if event["status"] not in ("FINALIZED", "NO_WINNER"):
        raise RuntimeError(f"Demo event is not final: {event['status']} phase={event['phase']}")

    if event["status"] == "FINALIZED" and event["winner"]:
        winner_role = next(name for name, account in accounts.items() if account.address.lower() == event["winner"].lower())
        credit = int(_read(clients[winner_role], address, "get_credit", [event["winner"]]))
        if credit:
            _write(record, clients, address, "withdraw_winner_prize", winner_role, "withdraw_credit", [])

    organizer_credit = int(_read(organizer_client, address, "get_credit", [organizer.address]))
    if organizer_credit:
        _write(record, clients, address, "withdraw_organizer_credit", "organizer", "withdraw_credit", [])
    organizer_credit = int(_read(organizer_client, address, "get_credit", [organizer.address]))

    submissions = _read(organizer_client, address, "list_submissions", [hackathon_id, 0, 25])["items"]
    record["completed_at"] = _timestamp()
    record["assertions"] = {
        "status": event["status"],
        "winner": event["winner"],
        "winner_project": event["winner_project"],
        "prize_atto": event["prize_atto"],
        "prize_released": event["prize_released"],
        "organizer_available_credit_atto": str(organizer_credit),
        "submission_count": event["submission_count"],
        "evaluated_count": event["evaluated_count"],
        "appeal_demonstrated": any(int(item["appeal_count"]) > 0 for item in submissions),
        "evidence_digests": {item["project_name"]: item["evidence_digest"] for item in submissions},
        "decisions": {
            item["project_name"]: {
                "status": item["status"],
                "eligibility": item["eligibility"],
                "score_band": item["score_band"],
                "confidence_bucket": item["confidence_bucket"],
                "reasoning": item["reasoning"],
            }
            for item in submissions
        },
    }
    _save(record)
    _output({"phase": "complete", "hackathon_id": hackathon_id, **record["assertions"]})


if __name__ == "__main__":
    main()
