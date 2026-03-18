from typing import Optional

from coloradomesh.meshcore.models.general import Node, NodeType
from backend.api.services.external_key_logic import get_colorado_nodes

def _node_type_conversion(node: Node) -> Optional[int]:
    if node.node_type == NodeType.COMPANION:
        return 1
    if node.node_type == NodeType.REPEATER:
        return 2
    elif node.node_type == NodeType.ROOM_SERVER:
        return 3
    else:
        return None



def prepare_contacts() -> dict:
    """
    Prepare a JSON object containing contacts in Colorado.
    """
    nodes: list[Node] = get_colorado_nodes()
    contacts = []
    for node in nodes:
        node_type: Optional[int] = _node_type_conversion(node)
        if not node_type:
            continue  # Skip if we can't determine the node type

        contacts.append({
            "type": node_type,  # Rooms (3) will be mis-typed as repeaters (2) due to data integrity issue with source
            "name": node.name,
            "custom_name": None,
            "public_key": node.public_key,
            "flags": 0,
            # needs to be strings
            "latitude": str(node.latitude),
            "longitude": str(node.longitude),
            "last_advert": node.last_heard,
            "last_modified": node.last_heard,
            "out_path": None,
        })
    return {"contacts": contacts}
