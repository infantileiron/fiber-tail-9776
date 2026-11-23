import hashlib
import json


def checksum(samples):
    payload = json.dumps(samples, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()
