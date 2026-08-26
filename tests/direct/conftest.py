"""Shared deterministic setup for GenLayer direct-mode tests."""

from datetime import datetime, timezone

import pytest

TEST_NOW_UNIX = 2_000_000_000


@pytest.fixture(autouse=True)
def deterministic_direct_time(direct_vm) -> None:
    """Keep contract time independent of the host clock and timezone."""
    direct_vm.warp(datetime.fromtimestamp(TEST_NOW_UNIX, tz=timezone.utc).isoformat())
