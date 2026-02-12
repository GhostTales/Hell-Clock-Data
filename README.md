# Hell Clock Data & Save Editor

This repository hosts a web-based save editor and data viewer for **Hell Clock**.

## Web Editor
You can access the web tools directly in your browser here:
[**https://ghosttales.github.io/Hell-Clock-Data/**](https://ghosttales.github.io/Hell-Clock-Data/)

### Features
- **Save File Management**: Load, edit, and download your `PlayerSave0.json`.
- **Relic Inspector**:
  - View and modify relic stats, upgrade levels, tiers, and rarity.
  - **Affix Editor**: Add, remove, or modify Primary, Secondary, and Implicit affixes with roll ranges.
  - **Relic Creation**: Generate specific unique or base relics directly into your inventory.
- **Inventory Management**: Visual grid and reliquary interface for organizing items.

## Running Locally
If you prefer to run the editor locally:

1.  Clone the repository:
    ```bash
    git clone https://github.com/Ghost-Tales/Hell-Clock-Data.git
    ```
2.  Navigate to the project directory:
    ```bash
    cd Hell-Clock-Data
    ```
3.  Start the local server (requires Python 3):
    ```bash
    python server.py
    ```
4.  Open your browser and navigate to: `http://localhost:8000`
