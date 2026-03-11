from coloradomesh.meshcore.models.general import Node
from coloradomesh.meshcore.services.companions import get_denver_companions
from coloradomesh.meshcore.services.public_keys import find_free_public_key_id
from coloradomesh.meshcore.services.repeaters import get_denver_repeaters


def suggest_public_key_id() -> str:
    """
    Suggest a new public key ID that is not currently in use.
    :return: A suggested public key ID that is not currently in use.
    :rtype: str
    """
    repeaters: list[Node] = get_denver_repeaters()
    companions: list[Node] = get_denver_companions()
    return find_free_public_key_id(existing_nodes=repeaters + companions)
