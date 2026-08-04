import { buildPageHref } from '../routes.js';

/**
 * Creates an HTML table for a list of treasure classes.
 * @param {Array<object>} treasureClasses - The array of treasure class data objects.
 * @param {Array<string>} keys - The keys to display as columns.
 * @returns {Promise<string>} HTML string for the treasure class list table.
 */
export async function createTreasureClassListTemplate(treasureClasses, keys) {
    if (!treasureClasses || treasureClasses.length === 0) {
        return '<p>No treasure classes found.</p>';
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
    const sortedTcs = [...treasureClasses].sort((a, b) => a.id - b.id);

    for (const tc of sortedTcs) {
        tableHtml += '<tr>';
        for (const key of keys) {
            let cellContent = '';
            switch (key.toLowerCase()) {
                case 'name':
                    const encodedName = encodeURIComponent(tc.name);
                    cellContent = `<a href="${buildPageHref(`treasure_classes/${encodedName}`)}">${tc.name}</a>`;
                    break;
                default:
                    cellContent = tc[key] !== undefined ? tc[key] : 'N/A';
                    if (typeof cellContent === 'object' && cellContent !== null) {
                        cellContent = JSON.stringify(cellContent);
                    }
            }
            tableHtml += `<td>${cellContent}</td>`;
        }
        tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table>';

    return tableHtml;
}