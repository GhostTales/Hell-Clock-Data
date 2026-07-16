import { getGameData } from './data.js';
import { getEnLoc } from './templates.js';

let searchIndex = null;

/**
 * Builds the search index from game data. Caches the result.
 * @returns {Promise<Array<{name: string, url: string}>>} The search index.
 */
export async function buildSearchIndex() {
    if (searchIndex) {
        return searchIndex;
    }

    const index = [];

    // Add static pages from a manifest file, with a fallback to a hardcoded list.
    let staticPagesAdded = false;
    try {
        // Fetch with no-cache to ensure the latest version is always loaded during development
        const response = await fetch('Pages/page-manifest.json', { cache: 'no-cache' });
        if (response.ok) {
            const staticPages = await response.json();
            staticPages.forEach(p => {
                // Manifest format: { "name": "Display Name", "path": "Page/Path_Without_Extension" }
                index.push({ name: p.name, url: `?page=${p.path}` });
            });
            staticPagesAdded = true;
        }
    } catch (error) {
        console.warn('Could not load page-manifest.json. Falling back to hardcoded list.', error);
    }

    if (!staticPagesAdded) {
        const fallbackStaticPages = [
            { name: 'Main Page', page: 'MainPage' },
            { name: 'Relics List', page: 'RelicsList' },
            { name: 'Treasure Classes List', page: 'TreasureClassesList' },
            { name: 'Documentation', page: 'Documentation' },
            { name: 'Examples', page: 'Examples' },
            { name: 'Dungeon List', page: 'DungeonList' }
        ];
        fallbackStaticPages.forEach(p => index.push({ name: p.name, url: `?page=${p.page}` }));
    }

    // Add relics
    const relics = await getGameData('Relics.json');
    if (relics) {
        relics.forEach(relic => {
            if (relic.canDrop) {
                const name = getEnLoc(relic.nameLocalizationKey) || relic.name;
                index.push({ name: name, url: `?page=relics/${encodeURIComponent(name)}` });
            }
        });
    }

    // Add treasure classes
    const treasureClasses = await getGameData('Treasure Class.json');
    if (treasureClasses) {
        treasureClasses.forEach(tc => {
            index.push({ name: tc.name, url: `?page=treasure_classes/${encodeURIComponent(tc.name)}` });
        });
    }

    // Add dungeons
    const dungeons = await getGameData('Dungeons.json');
    if (dungeons) {
        dungeons.forEach(dungeon => {
            index.push({ name: dungeon.name, url: `?page=dungeons/${encodeURIComponent(dungeon.name)}` });
        });
    }

    searchIndex = index;
    return searchIndex;
}


/**
 * Initializes the search functionality.
 */
export function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    if (!searchInput || !searchResults) return;

    // The dropdown is no longer used, so hide it.
    searchResults.style.display = 'none';

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) {
                // Redirect to a dedicated search results page
                window.location.href = `?page=Search&query=${encodeURIComponent(query)}`;
            }
        }
    });
}