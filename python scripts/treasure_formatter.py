import json
import re
from pathlib import Path

monoBehaviourPath = Path(r"C:\Users\Ghost-Tales\Desktop\hell clock scripts v2\json_data\monoBehaviour.json")
guidLookupPath = Path(r"C:\Users\Ghost-Tales\Desktop\hell clock scripts v2\json_data\guid_lookup.json")

with open(monoBehaviourPath) as json_data:
    monoBehaviours = json.load(json_data)

with open(guidLookupPath) as json_data:
    guidLookup = json.load(json_data)

NAME_PATTERN = re.compile(
    r"^Act\s+"
    r"(?:(?P<act>[1-3])\s+(?P<area>.+?)\s+Enemy\s+|X\s+(?P<realm>OBLIVION|ABYSS|VOID)\s+)"
    r"(?P<enemy_type>\w+)\s+Treasure\s+Class$",
    re.IGNORECASE
)

def findTreasureClasses(monoBehaviourJson: list):
    monoBehaviourMatches = []
    for data in monoBehaviourJson:
        monoBehaviour = data.get("MonoBehaviour")
        if not NAME_PATTERN.match(monoBehaviour.get("m_Name")):
            continue
        monoBehaviourMatches.append(monoBehaviour)
    return monoBehaviourMatches

def treasureClassFormater():
    monoList = findTreasureClasses(monoBehaviours)
    formattetList = []

    def formatChildTreasureClasses(_availableTreasureClasses, _total_weight, _roll_amount, _parentDropAmount = None):
        _childTreasureClasses = {}

        for t in _availableTreasureClasses:
            tData = t.get("_t")
            #print(tData)
            if "_treasureClass" in tData:
                tName = re.sub(r'(_0|_1|\.asset)+$', '', guidLookup[tData.get("_treasureClass").get("guid")])

            elif "_currencyDefinition" in tData:
                tName = re.sub(r'(_0|_1|\.asset)+$', '', guidLookup[tData.get("_currencyDefinition").get("guid")])
            else:
                tName = re.sub(r'(_0|_1|\.asset)+$', '', guidLookup[tData.get("guid")])

            multiplier = None

            if re.search(r"x\d+", tName):
                for i in monoBehaviours:
                    if i.get("MonoBehaviour").get("m_Name") == tName:
                        multiplier = i.get("MonoBehaviour").get("_amount")

            roll_min, roll_max = None, None
            if "_amountLimit" in tData:
                roll_min, roll_max = tData.get("_amountLimit").values()

            expected_drop_amount = t.get("_weight") / _total_weight * _roll_amount * (((roll_min or 0) + (roll_max or 0))/2 or 1) * (multiplier or 1) * (_parentDropAmount or 1)

            relicTiers = None
            subTreasures = {}
            subTreasures_key = None
            treasureClassKeys = ["_availableCurrencies", "_availableGear", "_availableRelics"]

            for i in monoBehaviours:
                if i.get("MonoBehaviour").get("m_Name") == tName:
                    for key in treasureClassKeys:
                        if "_tiers" in i.get("MonoBehaviour"):
                            relic_tiers_list = i.get("MonoBehaviour").get("_tiers").get("_list")
                            relicTiers = []
                            relic_tiers_total = 0
                            for relic_tier in relic_tiers_list:
                                relic_tiers_total += relic_tier.get("_weight")
                                relicTiers.append(
                                    {"weight": relic_tier.get("_weight"), "tier": relic_tier.get("_t")})

                            for relic_tier in relicTiers:
                                relic_tier["tier_chance"] = 1 / relic_tiers_total * relic_tier.get("weight")

                        if key in i.get("MonoBehaviour"):

                            subTreasures_key = key
                            _availableSubTreasureClasses = i.get("MonoBehaviour").get(key).get("_list")

                            child_total_weight = 0

                            for st in _availableSubTreasureClasses:
                                child_total_weight += st.get("_weight")

                            subTreasures = formatChildTreasureClasses(_availableSubTreasureClasses, child_total_weight, _roll_amount=1, _parentDropAmount=expected_drop_amount)

            if "_isFragment" in tData:
                if tData.get("_isFragment") == 1:
                    tName += " Fragment"

            _childTreasureClasses[tName] = {
                "weight": t.get("_weight"),
                **({"multiplier": multiplier} if multiplier is not None else {}),
                **({"roll_min": roll_min} if roll_min is not None else {}),
                **({"roll_max": roll_max} if roll_max is not None else {}),
                "per_roll_chance" : t.get("_weight") / _total_weight,
                "expected_drop_amount": expected_drop_amount,
                **({"relic_tiers": relicTiers} if relicTiers is not None else {}),
                **({subTreasures_key: subTreasures} if subTreasures is not None and subTreasures_key is not None else {}),
            }

        return _childTreasureClasses


    for mono in monoList:

        availableTreasureClasses = mono.get("_availableTreasureClasses").get("_list")
        weights = [_.get("_weight") for _ in availableTreasureClasses]
        weights_total = sum(weights)

        childTreasures = formatChildTreasureClasses(availableTreasureClasses, weights_total, mono.get("_amount"))

        formatDict = {
            "name": mono.get("m_Name"),
            "roll_amount": mono.get("_amount"),
            "weights": weights,
            "total_weight": weights_total,
            "availableTreasureClasses": childTreasures,
        }

        formattetList.append(formatDict)

    return formattetList


if __name__ == "__main__":

    data = treasureClassFormater()

    print(json.dumps(data, indent=4))
    with open("json_data/treasure_class_data.json", "w") as json_file:
        json.dump(data, json_file, indent=4)