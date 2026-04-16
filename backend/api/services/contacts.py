from typing import Optional

from coloradomesh.meshcore.services.contacts import (
    ContactsOrder,
    ContactsStatus,
    ContactsType,
    prepare_contacts as prepare_contacts_from_coloradomesh_library,
)


def prepare_contacts(count: int,
                     order: Optional[ContactsOrder],
                     status: Optional[ContactsStatus],
                     _type: Optional[ContactsType]) -> dict:
    """
    Prepare a JSON object containing contacts in Colorado.
    """
    return prepare_contacts_from_coloradomesh_library(
        count=count,
        order=order,
        status=status,
        _type=_type
    )
