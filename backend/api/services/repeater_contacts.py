from coloradomesh.meshcore.models.general import Node
from backend.api.services.external_key_logic import get_denver_repeaters


def prepare_repeater_contacts() -> dict:
    """
    Prepare a JSON object containing contacts for repeaters in the Denver area.
    """
    repeaters: list[Node] = get_denver_repeaters()
    contacts = []
    for repeater in repeaters:
        contacts.append({
            "type": 2,  # Rooms (3) will be mis-typed as repeaters (2) due to data integrity issue with source
            "name": repeater.name,
            "custom_name": None,
            "public_key": repeater.public_key,
            "flags": 0,
            # needs to be strings
            "latitude": str(repeater.latitude),
            "longitude": str(repeater.longitude),
            "last_advert": repeater.last_heard,
            "last_modified": repeater.last_heard,
            "out_path": None,
        })
    return {"contacts": contacts}
