import json

from coloradomesh.emojis import EmojiTools
from coloradomesh.meshcore.models.general import CompanionType
from flask import (
    Blueprint,
    render_template,
    request,
)

from backend.api.models.user_node_information import UserCompanionInformation
from backend.api.services.external_key_logic import suggest_public_key_id
from backend.constants import (
    FLASK_GET,
    FLASK_POST
)

companion_name_tool = Blueprint("companion_name_tool", __name__, url_prefix="/companion_name_tool")

# TODO: Recommended companion settings in base library

# Load recommended settings from static/data/recommended_settings.json file
with open('static/data/recommended_settings.json', 'r') as f:
    recommended_settings = json.load(f)

# Initialize emoji tools once at the module level to avoid reloading the emoji data on every request
emoji_tools = EmojiTools()


@companion_name_tool.route("/", methods=[FLASK_GET], strict_slashes=False)
def index():
    role_types = [
        {'code': CompanionType.PRIMARY.value, "human_readable": CompanionType.PRIMARY.value,
         "description": "The primary companion device, the default method to contact a user."},
        {'code': CompanionType.SECONDARY.value, "human_readable": CompanionType.SECONDARY.value,
         "description": "A secondary companion device, less critical than the primary device but still used regularly"},
        {'code': CompanionType.TERTIARY.value, "human_readable": CompanionType.TERTIARY.value,
         "description": "A tertiary companion device, used occasionally or for a specific purpose."},
        {'code': CompanionType.BACKUP.value, "human_readable": CompanionType.BACKUP.value,
         "description": "A backup companion device, not regularly used. Serves as a fallback option if other devices are unavailable or not working."},
        {'code': CompanionType.EMERGENCY.value, "human_readable": CompanionType.EMERGENCY.value,
         "description": "An emergency companion device, reserved for critical situations. May have special configurations or settings to ensure it remains operational when other devices may not be."},
        {'code': CompanionType.MOBILE.value, "human_readable": CompanionType.MOBILE.value,
         "description": "A mobile companion device, designed to be portable and used on the go, such as hiking."},
        {'code': CompanionType.VEHICLE.value, "human_readable": CompanionType.VEHICLE.value,
         "description": "A vehicle companion device, intended for use in a car or other vehicle. May have features or configurations optimized for mobile use."},
        {'code': CompanionType.HOME.value, "human_readable": CompanionType.HOME.value,
         "description": "A home companion device, intended for use in a household or non-mobile setting. May have features or configurations optimized for home use."},
    ]
    return render_template('companion-name-tool.html',
                           role_types=role_types
                           )


# API endpoints
@companion_name_tool.route('/submit', methods=[FLASK_POST])
def generate_companion_details():
    """
    Generate companion name and public key ID recommendation given the details.
    return: A JSON object containing the generated companion details
    """
    data = request.get_json()
    node_information: UserCompanionInformation = UserCompanionInformation.model_validate(data,
                                                                                         context=dict(
                                                                                             emoji_tools=emoji_tools)
                                                                                         )

    suggested_public_key_id: str = suggest_public_key_id()

    name: str = node_information.generate_name(
        public_key_id=suggested_public_key_id
    )

    settings_json: dict = recommended_settings
    settings_json['name'] = name

    return {
        "name": name,
        "public_key_id": suggested_public_key_id,
        "settings_json": settings_json,
        "settings_json_file_name": f"coloradomesh_meshcore_companion_config_{name}",
    }
