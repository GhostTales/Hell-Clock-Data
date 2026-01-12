import json
import re
from pathlib import Path
from collections import Counter

monoBehaviourPath = Path(r"json_data\monoBehaviour.json")
guidLookupPath = Path(r"json_data\guid_lookup.json")

used_monobehaviours = []

with open(monoBehaviourPath) as json_data:
    monoBehaviours = json.load(json_data)

with open(guidLookupPath) as json_data:
    guidLookup = json.load(json_data)

NAME_PATTERN = re.compile(
    "Act0[1-3]_DropBalance(?:_(?:Abyss|HellMode|Oblivion|Void))?",
    re.IGNORECASE
)

def find_dropbalance_classes(monoBehaviourJson: list):
    monoBehaviourMatches = []
    for data in monoBehaviourJson:
        monoBehaviour = data.get("MonoBehaviour")
        if not NAME_PATTERN.match(monoBehaviour.get("m_Name")):
            continue
        monoBehaviourMatches.append(monoBehaviour)
    return monoBehaviourMatches

def find_monobehavior_by_name(mono_name):
    for mono in monoBehaviours:
        if mono.get("MonoBehaviour").get("m_Name") == mono_name:
            return mono.get("MonoBehaviour")

def parse_devotion(bytes):
    if bytes is None:
        return None

    color_map = {
        "00000000": "green",
        "01000000": "red",
        "02000000": "blue"
    }
    # Split into 8-character chunks
    return [color_map.get(bytes[i:i+8], None) for i in range(0, len(bytes), 8) if bytes[i:i+8] != ""]

def parse_imbuement(bytes):
    if bytes is None:
        return None

    color_map = {
        "00000000": "Fury Imbued",
        "01000000": "Faith Imbued",
        "02000000": "Discipline Imbued"
    }
    # Split into 8-character chunks
    return [color_map.get(bytes[i:i+8], None) for i in range(0, len(bytes), 8) if bytes[i:i+8] != ""]


def dropbalance_class_formater():
    monoList = find_dropbalance_classes(monoBehaviours)
    formattet_list = []

    def format_child_treasure_class(monobehaviour, parent_expected_drop_amount = 1):
        if monobehaviour not in used_monobehaviours:
            used_monobehaviours.append(monobehaviour)

        pattern = re.compile(r'_available[A-Za-z]+$')
        amount = monobehaviour.get("_amount")
        weights = []
        sub_treasure = {}

        tiers = (monobehaviour.get("_tiers").get("_list") if monobehaviour.get("_tiers") else None)
        relic_keys = [
            "_rareRelicChance",
            "_magicRelicChance",
            "_uniqueRelicChance",
            "_imbueRelicChance",
            "_imbueCategories",
            "_corruptedRelicChance",
            "_locksmithRelicChance"
        ]
        relic_values = {k: monobehaviour.get(k) for k in relic_keys if k in monobehaviour}

        if relic_values:
            imbue = relic_values.get("_imbueCategories")
            relic_values["_imbueCategories"] = (parse_imbuement(imbue if imbue else None))

        unique_relic_treasure_mono = None
        if monobehaviour.get("_uniqueRelicTreasureClass"):
            if monobehaviour.get("_uniqueRelicTreasureClass").get("guid"):
                unique_relic_treasure = monobehaviour.get("_uniqueRelicTreasureClass").get("guid")
                unique_relic_treasure_name = re.sub(r'(_0|_1|\.asset)+$', '', guidLookup[unique_relic_treasure])
                unique_relic_treasure_mono = find_monobehavior_by_name(unique_relic_treasure_name)

        unique_relic_treasure_child = None
        if unique_relic_treasure_mono:
            unique_relic_treasure_child = format_child_treasure_class(unique_relic_treasure_mono, parent_expected_drop_amount * relic_values.get("_uniqueRelicChance"))


        ## goblins, grouping cut file size by almost 1/3
        for key in ("_damageTreasureClassPerType", "_deathTreasureClassPerType"):
            if monobehaviour.get(key):
                serialized_list = monobehaviour[key].get("_serializedList", [])
                per_type_dicts = {}

                # build per-Key dictionaries
                for entry in serialized_list:
                    key_index = entry.get("Key")
                    guid = entry.get("Value", {}).get("guid")
                    if guid is None:
                        continue
                    name = re.sub(r'(_0|_1|\.asset)+$', '', guidLookup[guid])
                    mono = find_monobehavior_by_name(name)
                    if key_index not in per_type_dicts:
                        per_type_dicts[key_index] = {}
                    per_type_dicts[key_index][name] = format_child_treasure_class(mono)

                # find shared treasure classes across all keys
                from collections import Counter

                usage = Counter()
                for d in per_type_dicts.values():
                    usage.update(d.keys())

                shared_names = {name for name, count in usage.items() if count == len(per_type_dicts)}

                base_group = {name: next(d[name] for d in per_type_dicts.values() if name in d) for name in
                              shared_names}

                # remove shared from per-Key dictionaries
                grouped_per_type = {}
                for k, d in per_type_dicts.items():
                    overrides = {name: v for name, v in d.items() if name not in shared_names}
                    grouped_per_type[k] = {
                        "_base": "COMMON" if shared_names else None,
                        "_add": overrides
                    }

                sub_treasure[key] = {
                    "_base_groups": {"COMMON": base_group} if shared_names else {},
                    "_types": grouped_per_type
                }

        ## everything else
        for key, value in monobehaviour.items():
            if not pattern.search(key):
                continue

            for i in monobehaviour.get(key).get("_list"):
                weights.append(i.get("_weight"))

            for list_value in value.get("_list"):
                weight = list_value.get("_weight")
                list_t = list_value.get("_t")

                sub_treasure_guid = (
                        list_t.get("guid")
                        or list_t.get("_treasureClass", {}).get("guid")
                        or list_t.get("_currencyDefinition", {}).get("guid")
                )

                if not sub_treasure_guid:
                    continue

                sub_treasure_name = re.sub(r'(_0|_1|\.asset)+$', '', guidLookup[sub_treasure_guid])
                sub_treasure_mono = find_monobehavior_by_name(sub_treasure_name)

                devotionAffinity = parse_devotion(sub_treasure_mono.get("_devotionAffinity"))

                multiplier = sub_treasure_mono.get("_amount")

                roll_min, roll_max = None, None
                if "_amountLimit" in list_t:
                    roll_min, roll_max = list_t.get("_amountLimit").values()

                if list_t.get("_isFragment") == 1:
                    sub_treasure_name += " Fragment"

                # might be right idk anymore
                expected_drop_amount = weight / sum(weights) * (amount or 1) * parent_expected_drop_amount

                sub_treasure_child = format_child_treasure_class(sub_treasure_mono, expected_drop_amount)

                sub_treasure_child_weights = []
                for inner_dict in sub_treasure_child.values():
                    if isinstance(inner_dict, dict):
                        for item in inner_dict.values():
                            if isinstance(item, dict):
                                weight = item.get("_weight")
                                if weight is not None:
                                    sub_treasure_child_weights.append(weight)

                sub_treasure[sub_treasure_name] = {
                    **({"_weight": weight} if weight is not None else {}),
                    **({"_multiplier": multiplier} if multiplier is not None else {}),
                    **({"_rollMin": roll_min} if roll_min is not None else {}),
                    **({"_rollMax": roll_max} if roll_max is not None else {}),
                    **({"_expectedDropAmount": expected_drop_amount} if expected_drop_amount is not None else {}),
                    **({"_devotionAffinity": devotionAffinity} if devotionAffinity is not None else {}),
                    **({"_childTreasureTotalWeight": sum(sub_treasure_child_weights)} if sub_treasure_child and sum(sub_treasure_child_weights) != 0 else {}),
                    **({key: sub_treasure_child} if sub_treasure_child is not None else {}),
                }

        formatted_child = {
            **({"_amount": amount} if amount is not None else {}),
            **(relic_values if relic_values else {}),
            **({"_childTreasureTotalWeight": sum(weights)} if len(weights) != 0 else {}),
            **({"_uniqueRelicTreasureClass": unique_relic_treasure_child} if unique_relic_treasure_child else {}),
            **({"_relicTiers" : tiers} if tiers else {}),
            **sub_treasure,
        }

        return formatted_child

    def format_child_dropbalance_class(drop_config):
        pattern = re.compile(
            r'_[A-Za-z]+TreasureClass|_lootGoblinDropTable|_blessedGearShopDefinition$'
        )


        floors = {}
        for config in drop_config:
            tc_dict = {}

            for key, value in config.items():
                # Handle chest treasure class separately
                if key == "_chestTreasureClass":
                    for entry in value.get("_serializedList", []):
                        guid = entry.get("Value", {}).get("guid")
                        if guid is None:
                            continue
                        name = re.sub(r'(_0|_1|\.asset)+$', '', guidLookup[guid])
                        mono = find_monobehavior_by_name(name)
                        tc_dict[name] = format_child_treasure_class(mono)
                    continue

                # logic for other treasure classes
                if not pattern.search(key):
                    continue

                guid = value.get("guid")
                if guid is None:
                    continue

                name = re.sub(r'(_0|_1|\.asset)+$', '', guidLookup[guid])
                mono = find_monobehavior_by_name(name)
                tc_dict[name] = format_child_treasure_class(mono)

            floors[f"_floor{config.get('_floor')}"] = tc_dict


        usage = Counter()
        for tc_dict in floors.values():
            usage.update(tc_dict.keys())

        COMMON_THRESHOLD = len(floors)
        shared_names = {
            name for name, count in usage.items()
            if count >= COMMON_THRESHOLD
        }


        base_group = {}
        for name in shared_names:

            base_group[name] = next(
                tc_dict[name] for tc_dict in floors.values() if name in tc_dict
            )


        floor_overrides = {}
        for floor, tc_dict in floors.items():
            overrides = {
                name: data
                for name, data in tc_dict.items()
                if name not in shared_names
            }
            floor_overrides[floor] = {
                "_base": "COMMON",
                "_add": overrides
            }

        return {
            "_base_groups": {
                "COMMON": base_group
            },
            "_floors": floor_overrides
        }

    for mono in monoList:

        available_drop_configs = mono.get("_floorDropConfigs")


        childTreasures = format_child_dropbalance_class(available_drop_configs)

        formatDict = {
            "_name": mono.get("m_Name"),
            "_goldDropFirstFloorValue": mono.get("_goldDropFirstFloorValue"),
            "_goldDropLastFloorValue": mono.get("_goldDropLastFloorValue"),
            "_goldDropVariance": mono.get("_goldDropVariance"),
            "_floorDropConfigs": childTreasures,
        }

        formattet_list.append(formatDict)

    return formattet_list, monoList


if __name__ == "__main__":
    data, used_monos = dropbalance_class_formater()
    used_monobehaviours.append(used_monos)

    with open("json_data/dropbalance_data.json", "w") as json_file:
        json.dump(data, json_file, indent=4, allow_nan=False, separators=(',', ':'), ensure_ascii=False)
    with open("json_data/dropbalance_monobehaviours.json", "w") as json_file:
        json.dump(used_monobehaviours, json_file, indent=4, allow_nan=False, separators=(',', ':'), ensure_ascii=False)
