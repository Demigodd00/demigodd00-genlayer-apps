"""StudioNet read adapter for long calldata (no writes or consensus overrides).

Studio's decode_method_call_data skips two RLP prefix bytes even when a long
list needs three. Its native raw-calldata path avoids that decoding bug.
Upstream: genlayerlabs/genlayer-studio/backend/protocol_rpc/transactions_parser.py
"""
from genlayer_py.abi import calldata
from genlayer_py.contracts.utils import make_calldata_object


def read_studionet_view(client, address: str, method: str, args: list):
    encoded = calldata.encode(make_calldata_object(method=method, args=args, kwargs=None))
    if not encoded or encoded[-1] == 0:
        raise ValueError("Raw StudioNet view calldata must not end in its legacy null sentinel")
    result = client.provider.make_request(method="gen_call", params=[{
        "type": "read", "to": address, "from": client.local_account.address,
        "data": "0x" + encoded.hex(), "transaction_hash_variant": "latest-final",
    }])["result"]
    # Hosted Studio returns hex; support the documented structured node result too.
    if isinstance(result, dict):
        if result.get("status", {}).get("code") != 0:
            raise RuntimeError("View execution failed: " + str(result.get("status")))
        result = result["data"]
    if not isinstance(result, str):
        raise RuntimeError("Invalid view response")
    return calldata.decode(bytes.fromhex(result.removeprefix("0x")))
