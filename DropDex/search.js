import { getGameData } from './data.js';
import { getEnLoc } from './templates.js';
import { formatAffixDescription } from './templates/formatters.js';
import { nonUniqueRelicIconMap } from './templates/utils.js';

let searchIndex = null;

/**
 * Builds a plain-text, lowercased blob of an intrinsic affix's name and
 * description (with any HTML markup stripped) so it can be matched against
 * search terms.
 * @param {object} entry - An entry from a relic's intrinsicAffixes array.
 * @param {Array<object>} allAffixData - All affix definitions.
 * @returns {string} The searchable text for the affix.
 */
function getIntrinsicAffixSearchText(entry, allAffixData) {
    const parts = [entry.name];
    const affixDef = allAffixData.find(a => a.id === entry.id);
    if (affixDef) {
        const description = formatAffixDescription(affixDef).replace(/<[^>]+>/g, ' ');
        parts.push(description);
    }
    return parts.join(' ');
}

/**
 * Builds an HTML list of a relic's intrinsic affixes with formatted descriptions.
 * @param {Array<object>} affixes - The relic's intrinsicAffixes array.
 * @param {Array<object>} allAffixData - All affix definitions.
 * @returns {string} HTML string, or an empty string if there are no affixes.
 */
function getIntrinsicAffixesHtml(affixes, allAffixData) {
    if (!affixes || affixes.length === 0) return "";
    // According to user feedback, there's only one intrinsic, so no list is needed.
    const entry = affixes[0];
    if (!entry) return "";

    const affixDef = allAffixData.find((a) => a.id === entry.id);
    const description = affixDef ? formatAffixDescription(affixDef) : entry.name;
    return `<div class="search-result-affixes">${description}</div>`;
}

/**
 * Resolves the icon URL for a relic, falling back to the manual non-unique icon map.
 * @param {object} relic - The relic data object.
 * @returns {string|null} The icon URL, or null if none could be resolved.
 */
function getRelicIconUrl(relic) {
    let spriteNames = relic.sprite;
    if (!spriteNames && nonUniqueRelicIconMap[relic.name]) {
        spriteNames = nonUniqueRelicIconMap[relic.name];
    }
    if (!spriteNames) return null;
    const spriteName = Array.isArray(spriteNames) ? spriteNames[0] : spriteNames;
    return `https://raw.githubusercontent.com/RogueSnail/hellclock-data-export/main/icons/${spriteName}.png`;
}

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
    const allAffixData = await getGameData('Relic Affixes.json');
    if (relics) {
        relics.forEach(relic => {
            if (relic.canDrop) {
                const name = getEnLoc(relic.nameLocalizationKey) || relic.name;
                let searchText = name;
                let intrinsicAffixesHtml = '';
                if (allAffixData && relic.intrinsicAffixes && relic.intrinsicAffixes.length > 0) {
                    const affixText = relic.intrinsicAffixes
                        .map(entry => getIntrinsicAffixSearchText(entry, allAffixData))
                        .join(' ');
                    searchText = `${name} ${affixText}`;
                    intrinsicAffixesHtml = getIntrinsicAffixesHtml(relic.intrinsicAffixes, allAffixData);
                }
                index.push({
                    name: name,
                    url: `?page=relics/${encodeURIComponent(name)}`,
                    searchText: searchText.toLowerCase(),
                    icon: getRelicIconUrl(relic),
                    intrinsicAffixesHtml: intrinsicAffixesHtml
                });
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
 * @param {function(string): void} navigate The function to handle SPA navigation.
 */
export function initializeSearch(navigate) {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    if (!searchInput || !searchResults) return;

    // The dropdown is no longer used, so hide it.
    searchResults.style.display = 'none';

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const query = searchInput.value.trim();
            if (query) {
                navigate(`?page=Search&query=${encodeURIComponent(query)}`);
            }
        }
    });
}