import json

print("Loading original JSON...")
with open('monoBehaviour-deduplicated.json', 'r', encoding='utf-8') as f:
    raw_data = json.load(f)

# The exact keys your app.js is ignoring
ignored_keys = {
    'm_ObjectHideFlags', 
    'm_CorrespondingSourceObject', 
    'm_PrefabInstance', 
    'm_PrefabAsset', 
    'm_GameObject', 
    'm_EditorClassIdentifier', 
    'm_EditorHideFlags'
}

def clean_object(obj):
    if isinstance(obj, list):
        return [clean_object(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: clean_object(v) for k, v in obj.items() if k not in ignored_keys}
    return obj

print("Cleaning and stripping unneeded Unity data...")
cleaned_data = clean_object(raw_data)

print("Saving minified JSON...")
# separators=(',', ':') removes whitespace to minify the output
with open('monoBehaviour.min.json', 'w', encoding='utf-8') as f:
    json.dump(cleaned_data, f, separators=(',', ':'))

print("Done! Check the file size of monoBehaviour.min.json")