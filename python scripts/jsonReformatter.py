import json
from pathlib import Path

INPUT_FILE = Path("PlayerSave0.json")      # change this
OUTPUT_FILE = Path("PlayerSave0.json")     # same file = overwrite

with INPUT_FILE.open("r", encoding="utf-8") as f:
    data = json.load(f)

with OUTPUT_FILE.open("w", encoding="utf-8") as f:
    json.dump(data, f, indent=4, ensure_ascii=False)