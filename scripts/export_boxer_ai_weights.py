"""Export Boxer AI PyTorch checkpoint weights into browser-friendly JSON.

Args:
    None. Configure the source checkpoint and output path via module constants.
"""

from __future__ import annotations

import json
import io
import pickle
import zipfile
from array import array
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT_PATH = REPO_ROOT / "checkpoints" / "gru_model.pt"
OUTPUT_PATH = REPO_ROOT / "src" / "model" / "assets" / "boxerAiWeights.json"


@dataclass(frozen=True)
class TensorRef:
    """Reference to one tensor stored inside a torch zip checkpoint."""

    storage_key: str
    storage_offset: int
    size: tuple[int, ...]
    stride: tuple[int, ...]


def rebuild_tensor_v2(
    storage_ref: dict[str, Any],
    storage_offset: int,
    size: tuple[int, ...],
    stride: tuple[int, ...],
    _requires_grad: bool,
    _backward_hooks: Any,
) -> TensorRef:
    """Mirror torch._utils._rebuild_tensor_v2 for metadata-only checkpoint loading."""

    return TensorRef(
        storage_key=str(storage_ref["key"]),
        storage_offset=int(storage_offset),
        size=tuple(int(value) for value in size),
        stride=tuple(int(value) for value in stride),
    )


class CheckpointUnpickler(pickle.Unpickler):
    """Custom unpickler that reconstructs tensor metadata without importing torch."""

    def find_class(self, module: str, name: str) -> Any:
        if module == "collections" and name == "OrderedDict":
            return OrderedDict
        if module == "torch._utils" and name == "_rebuild_tensor_v2":
            return rebuild_tensor_v2
        if module == "torch" and name.endswith("Storage"):
            return type(name, (), {})
        raise pickle.UnpicklingError(f"Unsupported global during checkpoint export: {module}.{name}")

    def persistent_load(self, pid: Any) -> dict[str, Any]:
        typename, _storage_type, key, _location, numel = pid
        if typename != "storage":
            raise pickle.UnpicklingError(f"Unsupported persistent type: {typename}")
        return {
            "key": key,
            "numel": int(numel),
        }


def default_stride(size: tuple[int, ...]) -> tuple[int, ...]:
    """Compute the contiguous stride for a tensor shape."""

    if not size:
        return ()

    stride = [1] * len(size)
    running = 1
    for index in range(len(size) - 1, -1, -1):
        stride[index] = running
        running *= size[index]
    return tuple(stride)


def nest_values(flat_values: list[float], shape: tuple[int, ...]) -> Any:
    """Convert a flat float list into nested Python lists with the given shape."""

    if not shape:
        return flat_values[0]

    if len(shape) == 1:
        return flat_values

    block_size = 1
    for dimension in shape[1:]:
        block_size *= dimension

    return [
        nest_values(flat_values[index : index + block_size], shape[1:])
        for index in range(0, len(flat_values), block_size)
    ]


def tensor_to_json_payload(archive: zipfile.ZipFile, tensor_ref: TensorRef, byteorder: str) -> dict[str, Any]:
    """Read one tensor payload from the checkpoint archive."""

    if tensor_ref.stride != default_stride(tensor_ref.size):
        raise ValueError(
            f"Only contiguous tensors are supported. "
            f"Expected stride {default_stride(tensor_ref.size)}, got {tensor_ref.stride}."
        )

    raw_bytes = archive.read(f"gru_model/data/{tensor_ref.storage_key}")
    values = array("f")
    values.frombytes(raw_bytes)

    if byteorder != "little":
        values.byteswap()

    total_values = 1
    for dimension in tensor_ref.size:
        total_values *= dimension

    slice_start = tensor_ref.storage_offset
    slice_end = tensor_ref.storage_offset + total_values
    flat_values = list(values[slice_start:slice_end])

    return {
        "shape": list(tensor_ref.size),
        "data": nest_values(flat_values, tensor_ref.size),
    }


def export_checkpoint(checkpoint_path: Path, output_path: Path) -> None:
    """Export the configured checkpoint into compact JSON."""

    with zipfile.ZipFile(checkpoint_path) as archive:
        byteorder = archive.read("gru_model/byteorder").decode("utf-8").strip()
        raw_pickle = archive.read("gru_model/data.pkl")
        checkpoint = CheckpointUnpickler(io.BytesIO(raw_pickle)).load()

        model_state = checkpoint["model_state_dict"]
        config = checkpoint.get("config", {})

        payload = {
            "config": config,
            "tensors": {
                name: tensor_to_json_payload(archive, tensor_ref, byteorder)
                for name, tensor_ref in model_state.items()
            },
        }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    export_checkpoint(CHECKPOINT_PATH, OUTPUT_PATH)
