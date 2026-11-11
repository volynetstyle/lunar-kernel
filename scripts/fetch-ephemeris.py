"""Fetch the pinned build-only DE441 files; reject changed or corrupt downloads."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

REVISION = "cae9ecd4b201544d85e411aced17660932514d43"
BASE_URL = f"https://raw.githubusercontent.com/aloistr/swisseph/{REVISION}/ephe/"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output-dir", type=Path, default=Path(".cache/ephe"))
args = parser.parse_args()
metadata = json.loads((Path(__file__).resolve().parents[1] / "data/provenance.json").read_text())
args.output_dir.mkdir(parents=True, exist_ok=True)
for name, expected in metadata["ephemerisSha256"].items():
    path = args.output_dir / name
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == expected:
        print(f"Verified cached {name}")
        continue
    with urlopen(BASE_URL + name, timeout=60) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError(f"Unexpected SHA-256 for {name}; refusing to change the model")
    path.write_bytes(data)
    print(f"Downloaded and verified {name}")
