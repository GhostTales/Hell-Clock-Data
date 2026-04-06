import json
from collections import Counter

def make_hashable(obj):
    if isinstance(obj, dict):
        # Sort keys and recursively process values
        return tuple((k, make_hashable(v)) for k, v in sorted(obj.items()))
    elif isinstance(obj, list):
        # Preserve order inside lists
        return tuple(make_hashable(x) for x in obj)
    else:
        return obj  # primitives (str, int, etc.)

def deduplicate(obj):
    if isinstance(obj, list):
        seen = set()
        result = []
        for item in obj:
            cleaned_item = deduplicate(item)
            key = make_hashable(cleaned_item)
            if key not in seen:
                seen.add(key)
                result.append(cleaned_item)
        return result

    elif isinstance(obj, dict):
        return {k: deduplicate(v) for k, v in obj.items()}

    else:
        return obj

def process_file(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    cleaned = deduplicate(data)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(cleaned, f, indent=2)

def extract_all_items(obj):
    """Flatten all elements (at any depth) into a list"""
    items = []

    if isinstance(obj, list):
        for x in obj:
            items.extend(extract_all_items(x))
        items.append(obj)

    elif isinstance(obj, dict):
        for v in obj.values():
            items.extend(extract_all_items(v))
        items.append(obj)

    else:
        items.append(obj)

    return items


def verify(input_file, dedup_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        original = json.load(f)

    with open(dedup_file, 'r', encoding='utf-8') as f:
        dedup = json.load(f)

    original_counts = Counter(make_hashable(x) for x in original)
    dedup_counts = Counter(make_hashable(x) for x in dedup)

    # Check that all deduplicated items exist in the original
    missing = [item for item in dedup_counts if item not in original_counts]

    if missing:
        print(f"FAIL: Some items in deduplicated file were not in original ({len(missing)} items).")
    else:
        print("PASS: All deduplicated items exist in original file.")

    # Optional: check that counts in dedup ≤ counts in original
    overcounted = [item for item, count in dedup_counts.items() if count > original_counts[item]]
    if overcounted:
        print(f"FAIL: Some items appear more times in deduplicated file than in original ({len(overcounted)} items).")
    else:
        print("Counts check passed: deduplicated counts are ≤ original counts.")

# usage
#process_file('monoBehaviour.json', 'monoBehaviour-deduplicated.json')
verify('monoBehaviour.json', 'monoBehaviour-deduplicated.json')