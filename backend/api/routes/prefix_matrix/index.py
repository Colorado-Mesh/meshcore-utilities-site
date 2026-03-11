import json

from coloradomesh.internal.utils import epoch_to_datetime  # Probably shouldn't be accessing internal utils
from coloradomesh.meshcore.models.general import Node
from coloradomesh.meshcore.models.general import NodeStatus
from coloradomesh.meshcore.services.public_keys import reserved_public_key_ids
from flask import (
    Blueprint,
    render_template,
)

from backend.api.services.external_key_logic import get_denver_repeaters
from backend.constants import (
    FLASK_GET,
)

prefix_matrix = Blueprint("prefix_matrix", __name__, url_prefix="/prefix_matrix")

# All reserved IDs (2-char hex strings)
reserved_ids = reserved_public_key_ids()


def _hex_chars() -> list[str]:
    return [f"{i:X}".upper() for i in range(16)]
    # return [f"{i:02X}" for i in range(256)]


def _build_repeater_info(repeater: Node) -> dict:
    return {
        "status": repeater.status.to_str(),
        "status_value": repeater.status.to_str().upper(),
        "location": f"{repeater.latitude}, {repeater.longitude}" if all(
            [repeater.latitude, repeater.longitude]) else "N/A",
        "last_heard": epoch_to_datetime(repeater.last_heard),
        "id": repeater.public_key_id_2_char,
        "public_key": repeater.public_key,
        "name": repeater.name,
        "contact_url": repeater.contact_url,
    }


def _build_info_json(repeaters: list[Node]) -> str:
    if len(repeaters) == 1:
        return json.dumps(_build_repeater_info(repeaters[0]))
    else:
        return json.dumps([_build_repeater_info(repeater) for repeater in repeaters])


def _build_matrix_entry(cell_id: str, repeaters: list[Node]) -> dict:
    # repeaters may be empty (free), have one entry (used), or multiple entries (duplicate)
    if not repeaters:
        css_class = "hex-free"
        if cell_id in reserved_ids:
            css_class += " hex-reserved"
        on_click_action = f'showAvailableInfo("{cell_id}")'
    elif len(repeaters) == 1:
        css_class = "hex-used"
        info_json = _build_info_json(repeaters)
        on_click_action = f'showRepeaterInfo("{cell_id}", {info_json})'
    else:  # len(repeaters) > 1
        css_class = "hex-duplicate"
        info_json = _build_info_json(repeaters)
        on_click_action = f'showDuplicateInfo("{cell_id}", {info_json})'

    if not any(repeater.status in [NodeStatus.ACTIVE, NodeStatus.NEW] for repeater in repeaters):
        css_class += " hex-inactive"

    return {
        "id": cell_id,
        "css_class": css_class,
        "onclick_js_action": on_click_action,
    }


def _build_matrix_row(row_hex_char: str, repeaters: list[Node]) -> dict:
    row_cells = {}

    for col_hex_char in _hex_chars():
        cell_id = f"{row_hex_char}{col_hex_char}"
        repeaters_with_cell_id = [repeater for repeater in repeaters if repeater.public_key_id_2_char == cell_id]
        row_cells[col_hex_char] = _build_matrix_entry(cell_id=cell_id, repeaters=repeaters_with_cell_id)

    """
    {
        "cells": {
            "0": {
                "repeaters": [...],
                "css_class": "hex-duplicate"
                ...
            },
            ...
        },
        "extra": "data here"
    }
    """
    return {
        "cells": row_cells
    }


def _build_matrix(repeaters: list[Node]) -> dict[str, dict]:
    matrix = {}

    for row_hex_char in _hex_chars():
        repeaters_starting_with_hex_char = [repeater for repeater in repeaters if
                                            repeater.public_key_id_first_char == row_hex_char]
        matrix[row_hex_char] = _build_matrix_row(row_hex_char=row_hex_char, repeaters=repeaters_starting_with_hex_char)

    """
    {
      "0": {
        "cells": {
            "0": {
                "repeaters": [],
                "css_class": "hex-free"
            }
            ...
        },
        "extra": "data here"
      }
      ...
    }
    """

    return matrix


@prefix_matrix.route("/", methods=[FLASK_GET])
def index():
    repeaters: list[Node] = get_denver_repeaters()

    matrix_data: dict = _build_matrix(repeaters)

    return render_template('prefix_matrix.html',
                           matrix_data=matrix_data,
                           hex_chars=_hex_chars(),
                           )
