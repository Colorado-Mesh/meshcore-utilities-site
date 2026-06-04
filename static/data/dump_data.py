import json
import qrcode

from colorado.airports import Airports
from colorado.counties import Counties
from colorado.mountains import Mountains
from colorado.municipalities import Municipalities
from colorado.unincorporated_areas import UnincorporatedAreas
from colorado.base.location import LocationEnum
from coloradomesh.meshcore.services.channels import get_hashtag_channel_keys
from coloradomesh.meshcore.utils import build_meshcore_channel_url

DATA_FOLDER = "./static/data"
CHANNEL_DETAILS_FILE = "channels.json"
CHANNELS_QR_CODE_FOLDER = "./static/data/channels"


class Channel:
    name: str
    order: int
    description: str

    def __init__(self, data: dict):
        self.name = data["name"]
        self.description = data["description"]
        self.order = data["order"]

def location_to_json(location: LocationEnum) -> dict:
    return json.loads(location._location.model_dump_json())


def write_to_file(data: list[dict], filename):
    with open(f"{DATA_FOLDER}/{filename}", "w") as f:
        json.dump(data, f, indent=4)

def read_from_file(filename: str):
    with open(f"{DATA_FOLDER}/{filename}", "r") as f:
        return json.load(f)


def generate_channel_qr_code_image(channel: Channel):
    name = channel.name
    clean_name = name.replace("#", "")
    order = channel.order

    key, _ = get_hashtag_channel_keys(channel_name=name)
    url = build_meshcore_channel_url(name=name, secret=key)

    qr_code_image = qrcode.make(data=url)
    qr_code_image.save(f"{CHANNELS_QR_CODE_FOLDER}/meshcore_channel_{order}_{clean_name}.png")


airport_data = [location_to_json(location=airport) for airport in Airports]
write_to_file(data=airport_data, filename="airports.json")

counties_data = [location_to_json(location=county) for county in Counties]
write_to_file(data=counties_data, filename="counties.json")

mountains_data = [location_to_json(location=mountain) for mountain in Mountains]
write_to_file(data=mountains_data, filename="mountains.json")

municipalities_data = [location_to_json(location=municipality) for municipality in Municipalities]
write_to_file(data=municipalities_data, filename="municipalities.json")

unincorporated_areas_data = [location_to_json(location=unincorporated_area) for unincorporated_area in UnincorporatedAreas]
write_to_file(data=unincorporated_areas_data, filename="unincorporated_areas.json")

channels_data = read_from_file(filename=CHANNEL_DETAILS_FILE)
channels = [Channel(data=data) for data in channels_data]
for _channel in channels:
    generate_channel_qr_code_image(channel=_channel)
