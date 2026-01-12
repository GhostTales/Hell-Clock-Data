import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import yaml
from yaml import CLoader


# Load and fix Unity YAML

# https://stackoverflow.com/questions/21473076/pyyaml-and-unusual-tags

def parse_file(file_path):
    def removeUnityTagAlias(filepath):
        result = ""
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                if line.startswith('--- !u!'):
                    # Keep only the type, remove the Unity ID & tags
                    result += '--- ' + line.split(' ')[2] + '\n'
                else:
                    # Quote _devotionAffinity to prevent octal/large int parsing
                    if line.strip().startswith('_devotionAffinity:') or line.strip().startswith('_imbueCategories:'):
                        key, value = line.split(':', 1)
                        value = value.strip()
                        if not (value.startswith('"') or value.startswith("'")):
                            value = (f'"{value}"' if value else 'null')
                        result += f"{key}: {value}\n"
                    # Fix bare '=' or other weird scalars by quoting them
                    elif line.strip().endswith('=') and ':' in line:
                        key = line.split(':')[0]
                        result += f'{key}: "="\n'
                    else:
                        result += line
        return result

    # Use FullLoader but safe handling of strange scalars
    try:
        nodes = list(yaml.load_all(removeUnityTagAlias(file_path), Loader=CLoader))
    except yaml.YAMLError as e:
        print("YAML parse error:", e)
        nodes = []

    return nodes

def parse_folder(folder_path):
    files_to_parse = [f for f in folder_path.glob("*.asset") if not f.stem.endswith("_0")]
    with ProcessPoolExecutor() as executor:

        return [
            mono
            for file_docs in executor.map(parse_file, files_to_parse)
            for mono in file_docs
        ]

def _parse_meta(meta_file):
    """Worker: parse a single .meta file and return (guid, filename)"""
    try:
        asset_path = meta_file.with_suffix("")  # remove .meta
        with open(meta_file, "r", encoding="utf-8") as f:
            meta_data = yaml.safe_load(f)
            guid = meta_data.get("guid")
            if guid:
                return guid, asset_path.name  # filename only
    except Exception:
        pass
    return None

def build_guid_lookup(project_folder):
    meta_files = list(project_folder.rglob("*.meta"))
    guid_lookup = {}

    with ProcessPoolExecutor() as executor:
        for result in executor.map(_parse_meta, meta_files):
            if result is not None:
                guid, filename = result
                guid_lookup[guid] = filename

    return guid_lookup

if __name__ == "__main__":
    folder = Path(
        r"C:\Users\Ghost-Tales\Desktop\hell clock export\AssetRipper_export_20251208_195719\ExportedProject\Assets\MonoBehaviour")

    all_data = parse_folder(folder)
    guid_lookup = build_guid_lookup(folder)

    #print(json.dumps(all_data, indent=4))
    with open("json_data/monoBehaviour.json", "w") as json_file:
        json.dump(all_data, json_file, indent=4)

    #print(json.dumps(guid_lookup, indent=4))
    with open("json_data/guid_lookup.json", "w") as json_file:
        json.dump(guid_lookup, json_file, indent=4)
