"""Deploy Lacuna only after lint and direct tests. Safe to rerun to resume."""
import os
import json
import subprocess
import sys

from lacuna_runtime import Runtime, ROOT, SOURCE, DEPLOYMENT, save_json, now, emit


def main():
    env = {**os.environ, "PYTHONUTF8": "1"}
    subprocess.run(["genvm-lint", "check", str(SOURCE)], cwd=ROOT, env=env, check=True)
    subprocess.run([sys.executable, "-m", "pytest", "tests/direct/test_lacuna.py", "-q", "--tb=short"], cwd=ROOT, env=env, check=True)
    runtime = Runtime("lacuna_deployment_011_journal.json")
    receipt = runtime.write("deploy-v1", "__deploy__", [], code=SOURCE.read_text(encoding="utf-8"))
    for key in ("tx_data_decoded", "data"):
        data = receipt.get(key)
        if isinstance(data, dict) and data.get("contract_address"):
            runtime.address = data["contract_address"]
            break
    if not runtime.address:
        raise RuntimeError("Missing deployed contract address")
    digest = runtime.verify_source()
    stats = runtime.read("get_stats")
    if stats.get("product") != "Lacuna" or stats.get("version") != "0.1.1-studionet" or stats.get("accounting_balanced") is not True:
        raise RuntimeError("Deployed configuration mismatch")
    runtime.record["contract"] = runtime.address
    runtime.save()
    if DEPLOYMENT.exists():
        previous = json.loads(DEPLOYMENT.read_text(encoding="utf-8"))
        if previous["address"].lower() != runtime.address.lower():
            archive = DEPLOYMENT.parent / "history" / ("lacuna_" + previous["address"][2:].lower() + ".json")
            if archive.exists() and json.loads(archive.read_text(encoding="utf-8")) != previous:
                raise RuntimeError("Deployment archive differs; refusing overwrite")
            save_json(archive, previous)
    save_json(DEPLOYMENT, {"contract": "Lacuna", "network": "studionet", "chain_id": 61999,
        "address": runtime.address, "version": stats["version"], "source_sha256": digest,
        "transaction_hash": runtime.record["transactions"]["deploy-v1"]["hash"],
        "deployer": runtime.accounts["sponsor"].address, "admin_controls": False,
        "runner_dependency": SOURCE.read_text(encoding="utf-8").splitlines()[0],
        "receipt_status": "FINALIZED", "execution_result": "SUCCESS",
        "verified_source_and_config": True, "verified_at": now()})
    emit({"verified_deployment": runtime.address, "source_sha256": digest})


if __name__ == "__main__":
    main()
