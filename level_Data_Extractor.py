import json
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import yaml_parser
from tqdm import tqdm


def find_unity_files(root_path):
    root = Path(root_path)

    unity_files = []
    asset_files = []

    for file in root.rglob("*"):
        if file.is_file():
            if file.suffix == ".unity":
                unity_files.append(file)
            elif file.suffix == ".asset":
                asset_files.append(file)

    return unity_files, asset_files



if __name__ == "__main__":
    path = Path(r"C:\Users\Ghost-Tales\Desktop\hell clock export\AssetRipper_export_20251208_195719\ExportedProject\Assets\_HellClock\Levels")

    unity_files, asset_files = find_unity_files(path)

    print(len(unity_files), len(asset_files))

    total_files = len(unity_files)
    with ProcessPoolExecutor() as executor:
        futures = {executor.submit(yaml_parser.parse_file, f): f for f in unity_files}

        for future in tqdm(as_completed(futures), total=total_files, desc="Parsing Unity files"):
            parsed_data = future.result()
            if parsed_data:
                file_stem = futures[future].stem + ".json"
                output_path = Path("json_data/scene_data/scenes_json") / file_stem
                with open(output_path, "w") as json_file:
                    json.dump(parsed_data, json_file, indent=4)

    guid_lookup = yaml_parser.build_guid_lookup(path)
    with open("json_data/scene_data/guid_lookup.json", "w") as json_file:
        json.dump(guid_lookup, json_file, indent=4)


    ### add parsing for assets

