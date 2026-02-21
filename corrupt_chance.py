import json


def load_config(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def calculate_pool_probabilities(pool_data):
    """Calculates the percentage chance for each item in a specific pool."""
    total_weight = sum(item['weight'] for item in pool_data)

    if total_weight == 0:
        return []

    results = []
    for item in pool_data:
        affix = item['value']
        chance = (item['weight'] / total_weight) * 100
        results.append({
            'id': affix.get('id'),
            'name': affix.get('name'),
            'weight': item['weight'],
            'chance_percent': chance
        })
    return results


def get_affix_chance_by_id(config_data, target_id):
    """Finds a specific affix ID across all sizes and categories and returns its roll chance."""
    results = []
    size_configs = config_data.get('relicSizeConfigs', {})

    for size_name, size_data in size_configs.items():
        affix_pools = size_data.get('implicitAffixPool', {})

        for category_name, pool in affix_pools.items():
            # Check if target ID exists in this pool
            if any(item['value'].get('id') == target_id for item in pool):
                pool_probs = calculate_pool_probabilities(pool)
                # Extract the specific item
                for prob in pool_probs:
                    if prob['id'] == target_id:
                        results.append({
                            'size': size_name,
                            'category': category_name,
                            'name': prob['name'],
                            'chance_percent': prob['chance_percent']
                        })
    return results


def get_affix_chances_by_category(config_data, size, category):
    """Returns the roll chance for all affixes within a specific size and category pool."""
    try:
        pool = config_data['relicSizeConfigs'][size]['implicitAffixPool'][category]
        return calculate_pool_probabilities(pool)
    except KeyError:
        print(f"Error: Size '{size}' or Category '{category}' not found.")
        return []


# --- Execution ---
if __name__ == "__main__":
    # Ensure the JSON file is in the same directory or provide the full path
    filepath = 'json_data/relic_data/Relic Inventory Config.json'

    try:
        data = load_config(filepath)

        # Example 1: Query by specific Affix ID
        test_id = 290  # Bombardment Plus 1 Affix
        print(f"--- Probabilities for Affix ID: {test_id} ---")
        id_results = get_affix_chance_by_id(data, test_id)
        for res in id_results:
            print(
                f"Size: {res['size']:<10} | Category: {res['category']:<10} | Chance: {res['chance_percent']:.2f}% | Name: {res['name']}")

        print("\n" + "=" * 50 + "\n")

        # Example 2: Query all affixes in a specific Size and Category
        test_size = "Small"
        test_category = "Corrupted"
        print(f"--- All Affix Probabilities for {test_size} / {test_category} ---")
        category_results = get_affix_chances_by_category(data, test_size, test_category)
        for res in category_results:
            print(f"ID: {res['id']:<4} | Chance: {res['chance_percent']:>5.2f}% | Name: {res['name']}")

    except FileNotFoundError:
        print(f"Failed to find file at {filepath}. Check the path and try again.")