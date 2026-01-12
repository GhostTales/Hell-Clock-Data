import json
import pyperclip  # pip install pyperclip
import os
import keyboard

# --- CONFIG ---
json_path = os.path.expandvars(r"%USERPROFILE%\AppData\LocalLow\Rogue Snail\Hell Clock\PlayerSave0.json")   # Change to your file

def copy_currency_data():
    # --- LOAD JSON ---
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    entries = data["currencySaveData"]["_persistentData"]

    # --- FORMAT FOR EXCEL (HORIZONTAL) ---
    cells = []
    ids = set()
    ids.add(0)

    for e in sorted(entries, key=lambda x: x["_currencyID"]):
        id = e["_currencyID"]
        if id not in ids:
            amount = e["_amount"]
            fragments = e["_fragmentAmount"]
            formula = f"={amount}+{fragments}/6"
            cells.append(formula)
            ids.add(id)

    # Join horizontally with tabs
    output = "\t".join(cells)
    pyperclip.copy(output)
    print("Copied:", output)

# --- Set key release handlers ---

# Copy on '<' release (without Shift)
# Exit on '>' release (Shift + '<')
def on_release(event):
    if keyboard.is_pressed("shift"):
        print("Exiting...")
        exit(0)
    else:
        copy_currency_data()

keyboard.on_release_key("<", on_release)

keyboard.wait()  # waits indefinitely for events
