import json
import os
from typing import Any, Optional

from flask import (
    Flask,
    render_template,
    request
)
from werkzeug.middleware.proxy_fix import ProxyFix

from backend.api.routes.companion_name_tool.index import companion_name_tool
from backend.api.routes.prefix_matrix.index import prefix_matrix
from backend.api.routes.repeater_name_tool.index import repeater_name_tool
from backend.api.routes.serial_usb_tool.index import serial_usb_tool
from backend.api.services.contacts import prepare_contacts, ContactsOrder, ContactsType, ContactsStatus
from backend.api.services.meshcore_stats import StatsService
from backend.constants import FLASK_HOST, FLASK_PORT, FLASK_GET

app = Flask(__name__)

# Trust reverse-proxy forwarded headers so redirects/url_for keep the public host/scheme/prefix.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)

application_root = os.getenv("APPLICATION_ROOT", "")
if application_root:
    app.config["APPLICATION_ROOT"] = application_root

preferred_url_scheme = os.getenv("PREFERRED_URL_SCHEME", "")
if preferred_url_scheme:
    app.config["PREFERRED_URL_SCHEME"] = preferred_url_scheme

server_name = os.getenv("SERVER_NAME", "")
if server_name:
    app.config["SERVER_NAME"] = server_name

app.register_blueprint(repeater_name_tool)
app.register_blueprint(companion_name_tool)
app.register_blueprint(prefix_matrix)
app.register_blueprint(serial_usb_tool)


# Landing page
@app.route('/', methods=[FLASK_GET])
def index():
    # TODO: Render stats widget
    stats = StatsService()
    node_count: int = stats.get_node_count()
    repeater_count: int = stats.get_repeater_count()
    companion_count: int = stats.get_companion_count()
    room_count: int = stats.get_room_count()
    _node_count_by_region: dict[str, int] = stats.get_node_count_by_region()  # {'fnl': 1, 'tex': 0, 'den': 3}
    node_region_leaderboard: list[dict[str, Any]] = sorted(
        [
            {"name": region_name, "count": count}
            for region_name, count in _node_count_by_region.items()
        ],
        key=lambda x: x["count"],
        reverse=True,
    )
    # [{'name': 'den', 'count': 3}, {'name': 'fnl', 'count': 1}, {'name': 'tex', 'count': 0}]

    return render_template('index.html',
                           node_count=node_count,
                           repeater_count=repeater_count,
                           companion_count=companion_count,
                           room_count=room_count,
                           node_region_leaderboard=node_region_leaderboard
                           )


@app.route('/contacts', methods=[FLASK_GET])
def get_contacts():
    """
    Send a JSON file with contacts in Colorado.
    return: A JSON object with a list of contacts in Colorado.
    """
    # Check if an "id" query parameter is provided
    params = request.args
    _limit: int = params.get('limit', 250)  # Default to 250 limit (can't hold infinite contacts in MeshCore app)
    _order: Optional[ContactsOrder] = params.get("order", None)
    _status: Optional[ContactsStatus] = params.get("status", None)
    _type: Optional[ContactsType] = params.get("type", None)

    data = prepare_contacts(count=_limit, order=_order, status=_status, _type=_type)
    return json.dumps(data)


if __name__ == '__main__':
    # In Docker, we want to bind to all interfaces and disable debug mode
    app.run(debug=False, host=FLASK_HOST, port=FLASK_PORT)
