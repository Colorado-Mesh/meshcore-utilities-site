from flask import Blueprint, render_template

from backend.constants import FLASK_GET

serial_usb_tool = Blueprint("serial_usb_tool", __name__, url_prefix="/serial_usb_tool")


@serial_usb_tool.route("/", methods=[FLASK_GET], strict_slashes=False)
def index():
    return render_template(
        "serial-usb-tool.html",
    )

