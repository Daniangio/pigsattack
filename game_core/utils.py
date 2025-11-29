from typing import Dict, Type

from .models import ResourceType


def parse_resource_key(key: str, error_cls: Type[Exception] = ValueError) -> ResourceType:
    normalized = (key or "").upper()
    if normalized in ("R", "RED"):
        return ResourceType.RED
    if normalized in ("B", "BLUE"):
        return ResourceType.BLUE
    if normalized in ("G", "GREEN"):
        return ResourceType.GREEN
    raise error_cls(f"Unknown resource type: {key}")


def sum_resources(resources: Dict[ResourceType, int]) -> int:
    return sum(int(v or 0) for v in resources.values())
