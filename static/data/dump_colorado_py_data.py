import json

from colorado.airports import Airports
from colorado.counties import Counties
from colorado.mountains import Mountains
from colorado.municipalities import Municipalities
from colorado.unincorporated_areas import UnincorporatedAreas
from colorado.base.location import LocationEnum

DATA_FOLDER = "./static/data"


def location_to_json(location: LocationEnum) -> dict:
    return json.loads(location._location.model_dump_json())


def write_to_file(data: list[dict], filename):
    with open(f"{DATA_FOLDER}/{filename}", "w") as f:
        json.dump(data, f, indent=4)


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
