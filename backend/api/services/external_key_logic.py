from coloradomesh.meshcore.models.general import Node
from coloradomesh.meshcore.services.nodes import get_colorado_nodes
from coloradomesh.meshcore.services.public_keys import find_free_public_key_id


def suggest_public_key_id() -> str:
    """
    Suggest a new public key ID that is not currently in use.
    :return: A suggested public key ID that is not currently in use.
    :rtype: str
    """
    nodes: list[Node] = get_colorado_nodes()
    return find_free_public_key_id(existing_nodes=nodes)
