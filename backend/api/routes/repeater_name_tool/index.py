from typing import Optional

from colorado import Mountains
from coloradomesh.colorado import Airports, Municipalities, UnincorporatedAreas
from coloradomesh.meshcore.models.general import RepeaterType, RepeaterSettings, RepeaterRegionSettings
from flask import (
    Blueprint,
    render_template,
    request,
)

from backend.api.models.user_node_information import UserRepeaterInformation
from backend.api.services.external_key_logic import suggest_public_key_id
from backend.constants import (
    FLASK_GET,
    FLASK_POST
)

repeater_name_tool = Blueprint("repeater_name_tool", __name__, url_prefix="/repeater_name_tool")

# Cache all region codes
region_codes = sorted([airport.iata_code.lower() for airport in Airports])

# Cache all city options alphabetically by name, with blank option at the top
city_five_char_limit = [
    {"name": "---", "code": "", "region": ""}
]
# We'll call them "cities" in the UI for simplicity, but they can be municipalities or unincorporated areas
cities = [municipality for municipality in Municipalities] + [area for area in UnincorporatedAreas]
for city in sorted(cities, key=lambda x: x.name):
    city_five_char_limit.append({
        "name": city.name,
        "code": city.abbreviations.five_letter,
        "region": city.nearest_airport.iata_code
    })
city_abbreviation_region_code_map = {
    city.abbreviations.five_letter: city.nearest_airport.iata_code for city in cities
}

# Cache all mountain options alphabetically by name, with blank option at the top
mountain_seven_char_limit = [
    {"name": "---", "code": "", "region": ""}
]
mountains = Mountains
for mountain in sorted(mountains, key=lambda x: x.name):
    mountain_seven_char_limit.append({
        "name": mountain.name,
        "code": mountain.abbreviations.seven_letter,
        "region": mountain.nearest_airport.iata_code
    })
mountain_abbreviation_region_code_map = {
    mountain.abbreviations.seven_letter: mountain.nearest_airport.iata_code for mountain in mountains
}


@repeater_name_tool.route("/", methods=[FLASK_GET], strict_slashes=False)
def index():
    # Check if an "id" query parameter is provided
    params = request.args
    prefill_id = params.get("id", "")
    if prefill_id and (not len(prefill_id) == 4 or not all(c in "0123456789ABCDEFabcdef" for c in prefill_id)):
        return "Invalid prefill ID. Must be a 4 character hexadecimal string.", 400

    node_types = [
        {'code': RepeaterType.REPEATER_EDGE.value, 'human_readable': RepeaterType.REPEATER_EDGE.human_readable,
         'description': 'A repeater that connects a neighborhood or building to distributor or core repeaters. Should be installed on residential rooftops or near windows. Can be solar-powered or plugged in, depending on location and power availability.'},
        {'code': RepeaterType.REPEATER_DISTRIBUTOR.value,
         'human_readable': RepeaterType.REPEATER_DISTRIBUTOR.human_readable,
         'description': 'A repeater that serves as a bridge between core repeaters and edge repeaters. Should be placed in a fixed, elevated suburban location. Typically solar-powered.'},
        {'code': RepeaterType.REPEATER_CORE.value, 'human_readable': RepeaterType.REPEATER_CORE.human_readable,
         'description': 'A repeater that serves as a critical backbone for the mesh network. Should be permanently installed in a fixed, high-elevation location. Typically solar-powered. Please coordinate with community members before installing a core repeater.'},
        {'code': RepeaterType.REPEATER_MOBILE.value, 'human_readable': RepeaterType.REPEATER_MOBILE.human_readable,
         'description': 'A repeater that is temporarily installed and can be moved to different locations as needed, or is installed in a vehicle.'},
        {'code': RepeaterType.ROOM_SERVER_STANDARD.value,
         'human_readable': RepeaterType.ROOM_SERVER_STANDARD.human_readable,
         'description': 'A room server that is permanently installed at a fixed location.'},
        {'code': RepeaterType.ROOM_SERVER_MOBILE.value, 'human_readable': RepeaterType.ROOM_SERVER_MOBILE.human_readable,
         'description': 'A room server that is temporarily installed and can be moved to different locations as needed, or is installed in a vehicle.'},
        {'code': RepeaterType.ROOM_SERVER_REPEAT_ENABLED.value,
         'human_readable': RepeaterType.ROOM_SERVER_REPEAT_ENABLED.human_readable,
         'description': 'A room server with repeater capabilities enabled. NOTE: While room servers can have repeater capabilities enabled, it is not officially recommended.'},
    ]
    return render_template('repeater-name-tool.html',
                           cities=city_five_char_limit,
                           mountains=mountain_seven_char_limit,
                           node_types=node_types,
                           prefill_id=prefill_id)


def _get_region(node_information: UserRepeaterInformation) -> Optional[str]:
    if node_information.city:
        return city_abbreviation_region_code_map.get(node_information.city, None)
    elif node_information.mountain:
        return mountain_abbreviation_region_code_map.get(node_information.mountain, None)

    return None

# API endpoints
@repeater_name_tool.route('/submit', methods=[FLASK_POST])
def generate_repeater_details():
    """
    Generate repeater name and public key ID recommendation given the details.
    return: A JSON object containing the generated repeater details
    """
    data = request.get_json()
    node_information: UserRepeaterInformation = UserRepeaterInformation(**data)

    region = _get_region(node_information=node_information)
    if not region:
        return "Could not determine proper region from provided details", 400

    suggested_public_key_id: str = (node_information.public_key_id or suggest_public_key_id()).upper()

    name: str = node_information.generate_name(
        region_code=region,
        public_key_id=suggested_public_key_id
    )

    recommended_settings: RepeaterSettings = node_information.node_type.recommended_settings
    recommended_settings.regions = RepeaterRegionSettings(
        all=region_codes,
        home=region.lower()  # User input will be one of the airport IATA codes
    )
    recommended_settings.name = name
    recommended_settings.owner_info = None  # TODO: Collect this?

    # User will need to inject the private key from the UI later

    settings_json: dict = recommended_settings.to_json()

    return {
        "name": name,
        "public_key_id": suggested_public_key_id,
        "settings_json": settings_json,
        "settings_json_file_name": f"coloradomesh_meshcore_repeater_config_{name}",
    }
