import json
import re
from pathlib import Path


def load_config(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def extract_affix_id(value):
    """Extract the affix ID from the exported '[290]=>NULL(NULL)' format."""
    if isinstance(value, dict):
        return value.get('id')

    if isinstance(value, str):
        match = re.match(r'\[(\d+)\]', value)
        if match:
            return int(match.group(1))

    return None


def load_affix_lookup(inventory_filepath):
    """Load Relic Affixes.json from the same directory as the inventory config."""
    affix_filepath = Path(inventory_filepath).parent / 'Relic Affixes.json'

    affix_data = load_config(affix_filepath)

    return {
        affix['id']: affix
        for affix in affix_data['Relic Affixes']
    }


def calculate_pool_probabilities(pool_data, affixes_by_id):
    """Calculate the percentage chance for each item in a pool."""
    total_weight = sum(item['weight'] for item in pool_data)

    if total_weight == 0:
        return []

    results = []

    for item in pool_data:
        affix_id = extract_affix_id(item['value'])
        affix = affixes_by_id.get(affix_id, {})

        results.append({
            'id': affix_id,
            'name': affix.get('name', f'Unknown Affix {affix_id}'),
            'weight': item['weight'],
            'chance_percent': (item['weight'] / total_weight) * 100
        })

    return results


def get_affix_chance_by_id(config_data, affixes_by_id, target_id):
    """Find a specific affix ID across all sizes and categories."""
    results = []
    size_configs = config_data.get('relicSizeConfigs', {})

    for size_name, size_data in size_configs.items():
        affix_pools = size_data.get('implicitAffixPool', {})

        for category_name, pool in affix_pools.items():
            pool_probs = calculate_pool_probabilities(pool, affixes_by_id)

            for prob in pool_probs:
                if prob['id'] == target_id:
                    results.append({
                        'size': size_name,
                        'category': category_name,
                        'id': prob['id'],
                        'name': prob['name'],
                        'weight': prob['weight'],
                        'chance_percent': prob['chance_percent']
                    })

    return results


def get_affix_chances_by_category(config_data, affixes_by_id, size, category):
    """Return roll chances for all affixes in a specific pool."""
    try:
        pool = config_data['relicSizeConfigs'][size]['implicitAffixPool'][category]
        return calculate_pool_probabilities(pool, affixes_by_id)
    except KeyError:
        print(f"Error: Size '{size}' or Category '{category}' not found.")
        return []


# --- Execution ---
if __name__ == "__main__":
    filepath = 'hellclock-data-export-main/hellclock-data-export-main/data/Relic Inventory Config.json'

    try:
        data = load_config(filepath)
        affixes_by_id = load_affix_lookup(filepath)

        # Example 2: Query all affixes in a specific Size and Category
        test_size = "Large"
        test_category = "Corrupted"

        print(f"--- All Affix Probabilities for {test_size} ---")

        category_results = get_affix_chances_by_category(
            data,
            affixes_by_id,
            test_size,
            test_category
        )

        for res in category_results:
            print(
                f"ID: {res['id']:<4} | "
                f"Weight: {res['weight']:<6} | "
                f"Chance: {res['chance_percent']:>6.2f}% | "
                f"Name: {res['name']}"
            )

    except FileNotFoundError as e:
        print(f"Failed to find required file: {e}")

    except KeyError as e:
        print(f"Unexpected JSON structure. Missing key: {e}")