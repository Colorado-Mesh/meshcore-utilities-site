import json

from coloradomesh.internal.utils import epoch_to_datetime  # Probably shouldn't be accessing internal utils
from coloradomesh.meshcore.models.general import Node
from coloradomesh.meshcore.models.general import NodeStatus
from coloradomesh.meshcore.services.public_keys import reserved_public_key_ids
from flask import (
    Blueprint,
    render_template,
)

from backend.api.services.external_key_logic import get_colorado_nodes
from backend.constants import (
    FLASK_GET,
)

prefix_matrix = Blueprint("prefix_matrix", __name__, url_prefix="/prefix_matrix")

# Normalize once for consistent comparisons
reserved_ids = {rid.upper() for rid in reserved_public_key_ids()}


def _hex_chars() -> list[str]:
    return [f"{i:X}".upper() for i in range(16)]


def _build_node_info(node: Node) -> dict:
    rid = _get_4char_id(node)
    return {
        "status": node.status.to_str(),
        "status_value": node.status.to_str().upper(),
        "location": f"{node.latitude}, {node.longitude}" if all(
            [node.latitude, node.longitude]) else "N/A",
        "last_heard": epoch_to_datetime(node.last_heard),
        "id": rid,
        "is_reserved_id": _is_reserved_id(rid),
        "public_key": node.public_key,
        "name": node.name,
        "contact_url": node.contact_url,
    }


def _build_info_json(nodes: list[Node]) -> str:
    if len(nodes) == 1:
        return json.dumps(_build_node_info(nodes[0]))
    else:
        return json.dumps([_build_node_info(node) for node in nodes])


def _build_search_infos(nodes: list[Node]) -> list[dict]:
    return [_build_node_info(node) for node in nodes]


def _build_search_text(nodes: list[Node]) -> str:
    searchable_values = []
    for info in _build_search_infos(nodes):
        searchable_values.extend([
            info.get("id"),
            info.get("name"),
            info.get("location"),
            info.get("status"),
            info.get("status_value"),
            info.get("public_key"),
            info.get("contact_url"),
            info.get("last_heard"),
        ])
    return " ".join(str(value) for value in searchable_values if value).lower()


def _get_4char_id(node: Node) -> str:
    """Get the first 4 hex chars of a node's public key ID."""
    return getattr(node, 'public_key_id_4_char', node.public_key_id_2_char).upper()


def _is_reserved_id(cell_id_4: str) -> bool:
    cell_id_4 = cell_id_4.upper()
    return cell_id_4 in reserved_ids or cell_id_4[:2] in reserved_ids


def _build_sub_cell(cell_id_4: str, nodes: list[Node]) -> dict:
    """Build a single cell for the secondary (chars 3&4) grid."""
    is_reserved = _is_reserved_id(cell_id_4)

    if not nodes:
        css_class = "hex-free"
        if is_reserved:
            css_class += " hex-reserved"
        on_click = f'showAvailableInfo("{cell_id_4}")'
    elif len(nodes) == 1:
        css_class = "hex-used"
        info_json = _build_info_json(nodes)
        on_click = f'showNodeInfo("{cell_id_4}", {info_json})'
    else:
        css_class = "hex-duplicate"
        info_json = _build_info_json(nodes)
        on_click = f'showDuplicateInfo("{cell_id_4}", {info_json})'

    if nodes and not any(node.status in [NodeStatus.ACTIVE, NodeStatus.NEW] for node in nodes):
        css_class += " hex-inactive"

    if is_reserved and nodes:
        css_class += " hex-reserved-in-use"

    return {
        "id": cell_id_4,
        "css_class": css_class,
        "onclick_js_action": on_click,
        "search_infos": _build_search_infos(nodes),
        "search_text": _build_search_text(nodes),
    }


def _build_sub_matrix(prefix_2: str, nodes: list[Node]) -> dict:
    """Build a 16x16 sub-matrix for chars 3 & 4 given a 2-char prefix."""
    sub_matrix = {}
    for row_char in _hex_chars():
        row_cells = {}
        for col_char in _hex_chars():
            cell_id_4 = f"{prefix_2}{row_char}{col_char}"
            matching = [node for node in nodes if _get_4char_id(node) == cell_id_4]
            row_cells[col_char] = _build_sub_cell(cell_id_4, matching)
        sub_matrix[row_char] = {"cells": row_cells}
    return sub_matrix


def _aggregate_css(prefix_2: str, nodes: list[Node]) -> str:
    """Determine primary grid cell CSS based on all nodes under a 2-char prefix."""
    if not nodes:
        css = "hex-free"
        if prefix_2 in reserved_ids:
            css += " hex-reserved"
        return css

    id_counts = {}
    for node in nodes:
        rid = _get_4char_id(node)
        id_counts[rid] = id_counts.get(rid, 0) + 1

    css = "hex-duplicate" if any(count > 1 for count in id_counts.values()) else "hex-used"

    has_active = any(node.status in [NodeStatus.ACTIVE, NodeStatus.NEW] for node in nodes)
    if not has_active:
        css += " hex-inactive"

    if prefix_2 in reserved_ids or any(_is_reserved_id(_get_4char_id(node)) for node in nodes):
        css += " hex-reserved-in-use"

    return css


def _build_matrix(nodes: list[Node]) -> dict:
    """
    Two-level matrix:
      primary key = first 2 hex chars
      each value has:
        - css_class: aggregate status for the primary cell
        - sub_matrix: 16x16 dict for chars 3 & 4
        - count: number of nodes under this prefix
    """
    matrix = {}
    for row_char in _hex_chars():
        row_data = {}
        for col_char in _hex_chars():
            prefix_2 = f"{row_char}{col_char}"
            matching = [node for node in nodes if _get_4char_id(node).startswith(prefix_2)]
            row_data[col_char] = {
                "id": prefix_2,
                "css_class": _aggregate_css(prefix_2, matching),
                "count": len(matching),
                "sub_matrix": _build_sub_matrix(prefix_2, matching),
            }
        matrix[row_char] = {"cells": row_data}
    return matrix


@prefix_matrix.route("/", methods=[FLASK_GET])
def index():
    nodes: list[Node] = get_colorado_nodes()
    matrix_data = _build_matrix(nodes)

    return render_template(
        'prefix_matrix.html',
        matrix_data=matrix_data,
        hex_chars=_hex_chars(),
    )
