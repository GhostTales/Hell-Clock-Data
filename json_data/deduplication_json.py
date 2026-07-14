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

    # Check 1: Output matches the deduplication logic exactly
    if deduplicate(original) != dedup:
        print("FAIL: Deduplicated file content does not match expected deduplication output.")
        return

    # Check 2: Ensure no unique primitive data was lost or added
    def extract_primitives(obj):
        if isinstance(obj, list):
            return [p for x in obj for p in extract_primitives(x)]
        if isinstance(obj, dict):
            return [p for v in obj.values() for p in extract_primitives(v)]
        return [obj]

    orig_primitives = set(extract_primitives(original))
    dedup_primitives = set(extract_primitives(dedup))

    if orig_primitives != dedup_primitives:
        print("FAIL: Unique primitive data changed during deduplication.")
    else:
        print("PASS: All checks passed. File matches deduplication logic, and data integrity is preserved.")

# usage
process_file('monoBehaviour.json', 'monoBehaviour-deduplicated.json')
verify('monoBehaviour.json', 'monoBehaviour-deduplicated.json')