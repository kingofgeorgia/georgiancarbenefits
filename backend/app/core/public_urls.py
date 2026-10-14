import re
from urllib.parse import unquote, urlsplit


def _public_url(value: str, hosts: set[str], *, https_only: bool = False):
    if len(value) > 2048 or any(ord(char) < 33 or char == "\\" for char in value):
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ({"https"} if https_only else {"http", "https"}):
            return None
        if parsed.hostname not in hosts or parsed.username is not None or parsed.password is not None:
            return None
        if parsed.port not in (None, 443 if parsed.scheme == "https" else 80):
            return None
        path = unquote(parsed.path)
        if any(segment in {".", ".."} for segment in path.split("/")):
            return None
        if any(ord(char) < 33 or char == "\\" for char in path):
            return None
        return parsed
    except ValueError:
        return None


def is_myauto_url(value: str) -> bool:
    return _public_url(value, {"myauto.ge", "www.myauto.ge"}) is not None


def extract_myauto_car_id(source: str) -> int | None:
    value = source.strip()
    if re.fullmatch(r"[0-9]{1,10}", value):
        return int(value) or None
    parsed = _public_url(value, {"myauto.ge", "www.myauto.ge"})
    if not parsed:
        return None
    match = re.fullmatch(r"/(?:en/|ru/|ka/)?pr/([0-9]{1,10})(?:/[^/?#]*)?/?", parsed.path)
    return (int(match.group(1)) or None) if match else None


def is_myauto_image_url(value: str) -> bool:
    parsed = _public_url(value, {"static.my.ge", "static.myauto.ge"}, https_only=True)
    if not parsed:
        return False
    return parsed.hostname != "static.my.ge" or parsed.path.startswith("/myauto/photos/")
