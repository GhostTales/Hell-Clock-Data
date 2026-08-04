import { DungeonConfigNameShorthandMap } from './utils.js';
import { buildPageHref } from '../routes.js';

/**
 * Creates an HTML table for a list of all dungeons.
 * @param {Array<object>} dungeons - The array of dungeon data objects.
 * @param {Array<string>} keys - The keys to display as columns.
 * @returns {Promise<string>} HTML string for the dungeon list table.
 */
export async function createAllDungeonsListTemplate(dungeons, keys) {
    if (!dungeons || dungeons.length === 0) {
        return '<p>No dungeons found.</p>';
    }

    let tableHtml = `<table class="relic-list-table">`;
    
    // Header
    tableHtml += '<thead><tr>';
    keys.forEach(key => {
        const headerText = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        tableHtml += `<th>${headerText}</th>`;
    });
    tableHtml += '</tr></thead>';

    // Body
    tableHtml += '<tbody>';
    const sortedDungeons = [...dungeons].sort((a, b) => (a.id || 0) - (b.id || 0));

    for (const dungeon of sortedDungeons) {
        tableHtml += '<tr>';
        for (const key of keys) {
            let cellContent = '';
            switch (key.toLowerCase()) {
                case 'name':
                    const dungeonName = DungeonConfigNameShorthandMap[dungeon.name] || dungeon.name;
                    const encodedName = encodeURIComponent(dungeon.name);
                    cellContent = `<a href="${buildPageHref(`dungeons/${encodedName}`)}">${dungeonName}</a>`;
                    break;
                case 'internalname':
                    cellContent = dungeon.name;
                    break;
                default:
                    const value = dungeon[key];
                    cellContent = value !== undefined ? (typeof value === 'object' ? JSON.stringify(value) : value) : 'N/A';
                    break;
            }
            tableHtml += `<td>${cellContent}</td>`;
        }
        tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table>';

    return tableHtml;
}