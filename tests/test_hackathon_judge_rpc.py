from types import SimpleNamespace
from unittest.mock import Mock
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location

import pytest
from genlayer_py.abi import calldata

_spec = spec_from_file_location("hackathon_judge_rpc", Path(__file__).resolve().parents[1] / "scripts/hackathon_judge_rpc.py")
_rpc = module_from_spec(_spec)
_spec.loader.exec_module(_rpc)
read_studionet_view = _rpc.read_studionet_view


def test_long_view_uses_raw_calldata_and_preserves_final_state_filter():
    expected = {"challenge": "proof" * 100}
    provider = SimpleNamespace(make_request=Mock(return_value={"result": calldata.encode(expected).hex()}))
    client = SimpleNamespace(provider=provider, local_account=SimpleNamespace(address="0x" + "1" * 40))
    args = ["hj-1", "0x" + "2" * 40, "https://github.com/owner/repo/blob/main/" + "x" * 150 + ".txt", "a" * 64]
    assert read_studionet_view(client, "0x" + "3" * 40, "get_evidence_challenge", args) == expected
    request = provider.make_request.call_args.kwargs["params"][0]
    assert request["type"] == "read" and request["transaction_hash_variant"] == "latest-final"
    assert "sim_config" not in request and "leader_results" not in request
    decoded = calldata.decode(bytes.fromhex(request["data"][2:]))
    assert decoded["args"] == args and decoded["method"] == "get_evidence_challenge"


def test_structured_error_is_never_reported_as_a_successful_view():
    provider = SimpleNamespace(make_request=Mock(return_value={"result": {"status": {"code": 1, "message": "rejected"}, "data": "00"}}))
    client = SimpleNamespace(provider=provider, local_account=SimpleNamespace(address="0x" + "1" * 40))
    with pytest.raises(RuntimeError, match="View execution failed"):
        read_studionet_view(client, "0x" + "3" * 40, "get_config", [])
