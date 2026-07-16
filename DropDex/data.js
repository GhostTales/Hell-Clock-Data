// In-memory cache for game data to avoid re-fetching
const gameDataCache = {};

/**
 * Fetches and caches game data from JSON files.
 * @param {string} path - The path to the data file relative to json_data.
 * @returns {Promise<object>} The fetched JSON data.
 */
export async function getGameData(path) {
    const baseUrl = 'https://raw.githubusercontent.com/RogueSnail/hellclock-data-export/main/data/';
    const fullUrl = `${baseUrl}${path}`;

    if (gameDataCache[fullUrl]) {
        return gameDataCache[fullUrl];
    }
    try {
        const response = await fetch(fullUrl);
        if (!response.ok) {
            throw new Error(`Network response was not ok for ${path}`);
        }
        const data = await response.json();
        
        const keys = Object.keys(data);
        if (keys.length === 1 && Array.isArray(data[keys[0]])) {
            gameDataCache[fullUrl] = data[keys[0]];
            return data[keys[0]];
        }

        gameDataCache[fullUrl] = data;
        return data;
    } catch (error) {
        console.error(`Failed to fetch game data for '${path}':`, error);
        return null;
    }
}