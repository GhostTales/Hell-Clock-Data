import { getFloorTreasureClassRefs } from './utils.js';
import { buildPageHref } from '../routes.js';

/**
 * Creates an HTML representation of a dungeon page.
 * @param {object} dungeon - The dungeon data object.
 * @returns {Promise<string>} HTML string for the dungeon page content.
 */
export async function createDungeonTemplate(dungeon) {
    if (!dungeon) {
        return '<span class="error">[Dungeon data not found]</span>';
    }

    let floorsHtml = '';

    if (dungeon.dropBalance && Array.isArray(dungeon.dropBalance.floorDropConfigs)) {
        const sortedFloors = [...dungeon.dropBalance.floorDropConfigs].sort((a, b) => a.floor - b.floor);

        for (const floorConfig of sortedFloors) {
            floorsHtml += `<h3 class="tool-heading">Floor ${floorConfig.floor}</h3>`;
            
            const tcRefs = getFloorTreasureClassRefs(floorConfig);

            let floorTcsHtml = '';
            let hasContent = false;

            for (const source in tcRefs) {
                const tc = tcRefs[source];
                if (tc && tc.name) {
                    hasContent = true;
                    const encodedName = encodeURIComponent(tc.name);
                    const tcLink = `<a href="${buildPageHref(`treasure_classes/${encodedName}`)}">${tc.name}</a>`;
                    floorTcsHtml += `<tr><td>${source}</td><td>${tcLink}</td></tr>`;
                }
            }

            if (hasContent) {
                floorsHtml += '<table class="relic-list-table"><thead><tr><th>Source</th><th>Treasure Class</th></tr></thead><tbody>';
                floorsHtml += floorTcsHtml;
                floorsHtml += '</tbody></table>';
            } else {
                floorsHtml += '<p>No treasure class information for this floor.</p>';
            }
        }
    } else {
        floorsHtml = '<p>No floor drop configurations found for this dungeon.</p>';
    }

    return `<div class="dungeon-details">${floorsHtml}</div>`;
}