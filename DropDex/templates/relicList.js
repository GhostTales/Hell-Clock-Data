import { getEnLoc, nonUniqueRelicIconMap, devotionColorMap, relicSizeMap } from './utils.js';
import { formatAffixDescription } from './formatters.js';
import { buildPageHref } from '../routes.js';

/**
 * Creates an HTML table for a list of relics with customizable columns.
 * @param {Array<object>} relics - The array of relic data objects.
 * @param {Array<object>} allAffixData - The array of all affix definitions.
 * @param {object} options - The options for filtering and display.
 * @returns {Promise<string>} HTML string for the relic list table.
 */
export async function createRelicListTemplate(relics, allAffixData, options = {}) {
    if (!relics || relics.length === 0) {
        return '<p>No relics found.</p>';
    }

    const processIntrinsicAffixesList = (affixes) => {
        if (!affixes || affixes.length === 0) return '';
        let html = '<ul style="margin: 0; padding-left: 20px;">';
        affixes.forEach(entry => {
             const affixDef = allAffixData.find(a => a.id === entry.id);
             if (affixDef) {
                html += `<li>${formatAffixDescription(affixDef)}</li>`;
             } else {
                html += `<li>${entry.name} (ID: ${entry.id}) - <span class="error">Def not found</span></li>`;
             }
        });
        html += '</ul>';
        return html;
    };

    const { keys = [], unique, nonUnique, uber, nightmare, ids } = options;

    let filteredRelics = [...relics];

    // Filter by a list of relic IDs if provided
    if (ids && Array.isArray(ids) && ids.length > 0) {
        const idSet = new Set(ids.map(id => Number(id)));
        filteredRelics = filteredRelics.filter(r => idSet.has(r.id));
    }

    // Further filter relics based on other options
    if (uber) {
        filteredRelics = filteredRelics.filter(r => r.relicTypes && Array.isArray(r.relicTypes) && r.relicTypes.includes('Uber'));
    }
    if (nightmare) {
        filteredRelics = filteredRelics.filter(r => r.relicTypes && Array.isArray(r.relicTypes) && r.relicTypes.includes('Nightmare'));
    }
    if (unique) {
        filteredRelics = filteredRelics.filter(r => r.type === 'UniqueRelicBaseDefinition');
    }
    if (nonUnique) {
        filteredRelics = filteredRelics.filter(r => r.type !== 'UniqueRelicBaseDefinition');
    }

    let tableHtml = `<table class="relic-list-table">`;
    
    // Header
    tableHtml += '<thead><tr>';
    const displayKeys = keys.filter(k => !['unique', 'nonUnique', 'uber', 'nightmare'].includes(k.toLowerCase()));

    displayKeys.forEach(key => {
        const headerText = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        tableHtml += `<th>${headerText}</th>`;
    });
    tableHtml += '</tr></thead>';

    // Body
    tableHtml += '<tbody>';
    const sortedRelics = filteredRelics.sort((a, b) => a.id - b.id);

    for (const relic of sortedRelics) {
        if (!relic.canDrop) continue;

        tableHtml += '<tr>';
        for (const key of displayKeys) {
            let cellContent = '', tdClass = '';
            switch (key.toLowerCase()) {
                case 'icon':
                    let spriteNames = relic.sprite;
                    if (!spriteNames && nonUniqueRelicIconMap[relic.name]) {
                        spriteNames = nonUniqueRelicIconMap[relic.name]; // This can be a string or an array
                    }
                    let imagesHtml = '';
                    if (spriteNames) {
                        if (Array.isArray(spriteNames)) {
                            spriteNames.forEach(spriteName => {
                                const iconPath = `https://raw.githubusercontent.com/RogueSnail/hellclock-data-export/main/icons/${spriteName}.png`;
                                imagesHtml += `<img src="${iconPath}" alt="icon" onerror="this.style.display='none'">`;
                            });
                        } else {
                            const iconPath = `https://raw.githubusercontent.com/RogueSnail/hellclock-data-export/main/icons/${spriteNames}.png`;
                            imagesHtml += `<img src="${iconPath}" alt="icon" onerror="this.style.display='none'">`;
                        }
                    }
                    cellContent = imagesHtml;
                    tdClass = 'relic-list-icon-cell';
                    break;
                case 'name':
                    const relicName = getEnLoc(relic.nameLocalizationKey) || relic.name;
                    const encodedName = encodeURIComponent(relicName);
                    cellContent = `<a href="${buildPageHref(`relics/${encodedName}`)}">${relicName}</a>`;
                    break;
                case 'devotion':
                case 'devotionaffinity':
                    cellContent = (relic.devotionAffinity && relic.devotionAffinity.length > 0) ? relic.devotionAffinity.map(color => devotionColorMap[color.toLowerCase()]).join(', ') : 'None';
                    break;
                case 'intrinsicaffix':
                case 'intrinsicaffixes':
                    cellContent = processIntrinsicAffixesList(relic.intrinsicAffixes);
                    break;
                case 'erelicsize':
                    cellContent = relic.eRelicSize ? relicSizeMap[relic.eRelicSize] : 'N/A';
                    break;
                case 'relictypes':
                    cellContent = (relic.relicTypes && Array.isArray(relic.relicTypes) && relic.relicTypes.length > 0) ? relic.relicTypes.join(', ') : 'None';
                    break;
                default:
                    cellContent = relic[key] !== undefined ? relic[key] : 'N/A';
                    if (typeof cellContent === 'object' && cellContent !== null) {
                        cellContent = `<pre>${JSON.stringify(cellContent, null, 2)}</pre>`;
                    }
            }
            tableHtml += `<td${tdClass ? ` class="${tdClass}"` : ''}>${cellContent}</td>`;
        }
        tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table>';

    return tableHtml;
}