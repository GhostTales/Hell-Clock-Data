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
                    tokens = line.strip().split()
                    if len(tokens) >= 3:
                        result += '--- ' + tokens[2] + '\n'
                    else:
                        result += '--- \n'
                else:
                    if line.strip().startswith('_devotionAffinity:') or line.strip().startswith('_imbueCategories:'):
                        key, value = line.split(':', 1)
                        cleaned_value = value.strip()
                        if cleaned_value:
                            if not (cleaned_value.startswith('"') or cleaned_value.startswith("'")):
                                cleaned_value = f'"{cleaned_value}"'
                            result += f"{key}: {cleaned_value}\n"
                        else:
                            result += line
                    elif line.strip().endswith('=') and ':' in line:
                        key = line.split(':')[0]
                        result += f'{key}: "="\n'
                    else:
                        result += line
        return result

    cleaned_yaml = removeUnityTagAlias(file_path)
    try:
        nodes = list(yaml.load_all(cleaned_yaml, Loader=CLoader))
    except yaml.YAMLError as e:
        print(f"\n[ERROR] {file_path.name}: {e}")
        
        # Extract line number to print the malformed context
        import re
        match = re.search(r"line (\d+)", str(e))
        if match:
            target_line = int(match.group(1))
            yaml_lines = cleaned_yaml.splitlines()
            start = max(0, target_line - 4)
            end = min(len(yaml_lines), target_line + 4)
            
            print(f"--- Context (Lines {start+1} to {end}) ---")
            for idx in range(start, end):
                marker = "-> " if idx == target_line - 1 else "   "
                print(f"{marker}{idx+1}: {yaml_lines[idx]}")
            print("-" * 40)
            
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
    assets_root = Path(r"AssetRipper_export_20260713_121158/ExportedProject/Assets")
    mono_folder = assets_root / "MonoBehaviour"

    all_data = parse_folder(mono_folder)
    guid_lookup = build_guid_lookup(assets_root)  # Scans all subdirectories for .meta files

    with open("monoBehaviour.json", "w") as json_file:
        json.dump(all_data, json_file, indent=4)

    with open("guid_lookup.json", "w") as json_file:
        json.dump(guid_lookup, json_file, indent=4)
