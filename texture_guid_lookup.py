import os
import re
import json

FOLDER = r"Sprite"

guid_pattern = re.compile(r'^guid:\s*([a-f0-9]+)', re.IGNORECASE)

lookup = {}

for filename in os.listdir(FOLDER):
    if not filename.endswith(".meta"):
        continue

    path = os.path.join(FOLDER, filename)

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            match = guid_pattern.match(line)
            if match:
                guid = match.group(1)

                # remove .asset.meta or just .meta
                name = filename
                if name.endswith(".asset.meta"):
                    name = name[:-11]
                else:
                    name = os.path.splitext(name)[0]

                lookup[guid] = name
                break

# print or save
print(json.dumps(lookup, indent=4))

# optional save
#with open("texture_guid_lookup.json", "w", encoding="utf-8") as f:
     #json.dump(lookup, f, indent=4)