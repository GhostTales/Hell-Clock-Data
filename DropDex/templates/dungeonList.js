import { DungeonConfigNameShorthandMap } from './utils.js';
import { buildPageHref } from '../routes.js';

/**
 * Creates an HTML table of dungeons that contain a specific Treasure Class.
 * @param {Array<object>} allDungeons - All dungeon data.
 * @param {object} targetTc - The target Treasure Class data object.
 * @returns {Promise<string>} HTML string for the dungeon list table.
 */
export async function createDungeonListTemplate(allDungeons, targetTc) {
    if (!allDungeons || allDungeons.length === 0) {
        return '<p>No dungeon data available. Please ensure <strong>Dungeons.json</strong> is present and correctly formatted.</p>';
    }
    if (!targetTc) {
        return '<p>Target Treasure Class not found.</p>';
    }

    const containingDungeons = [];

    for (const dungeon of allDungeons) {
        const sources = new Set();

        // Dungeons reference treasure classes via dropBalance.floorDropConfigs
        if (dungeon.dropBalance && Array.isArray(dungeon.dropBalance.floorDropConfigs)) {
            for (const floorConfig of dungeon.dropBalance.floorDropConfigs) {
                // Check direct TC references
                const directTcRefs = {
                    "Regular Enemy": floorConfig.regularEnemyTreasureClass,
                    "Champion Enemy": floorConfig.championEnemyTreasureClass,
                    "Rare Enemy": floorConfig.rareEnemyTreasureClass,
                    "Unique Enemy": floorConfig.uniqueEnemyTreasureClass,
                    "Boss": floorConfig.bossTreasureClass,
                    "Breakable": floorConfig.breakableTreasureClass,
                    "Basic Gear": floorConfig.basicGearTreasureClass,
                    "Blessed Gear": floorConfig.blessedGearTreasureClass,
                    "Relic": floorConfig.relicTreasureClass,
                    "Unique Relic": floorConfig.uniqueRelicTreasureClass,
                };

                for (const source in directTcRefs) {
                    const tc = directTcRefs[source];
                    if (tc && (tc.id === targetTc.id || (tc.name && tc.name.toLowerCase() === targetTc.name.toLowerCase()))) {
                        sources.add(source);
                    }
                }

                // Check chest treasure classes, which is an object, not an array
                if (floorConfig.chestTreasureClass && typeof floorConfig.chestTreasureClass === 'object') {
                    for (const chestType in floorConfig.chestTreasureClass) {
                        const tc = floorConfig.chestTreasureClass[chestType];
                        if (tc && (tc.id === targetTc.id || (tc.name && tc.name.toLowerCase() === targetTc.name.toLowerCase()))) {
                            sources.add(`${chestType} Chest`);
                        }
                    }
                }
            }
        }

        if (sources.size > 0) {
            containingDungeons.push({
                dungeon: dungeon,
                sources: Array.from(sources).join(', ')
            });
        }
    }

    if (containingDungeons.length === 0) {
        return `<p>No dungeons found that contain the treasure class "<strong>${targetTc.name}</strong>".</p>`;
    }

    let tableHtml = `<h4>Dungeons containing ${targetTc.name}</h4>`;
    tableHtml += `<table class="relic-list-table">`;
    tableHtml += '<thead><tr><th>Dungeon</th><th>Source</th></tr></thead>';
    tableHtml += '<tbody>';

    for (const entry of containingDungeons) {
        const dungeonName = DungeonConfigNameShorthandMap[entry.dungeon.name] || entry.dungeon.name;
        const encodedName = encodeURIComponent(entry.dungeon.name);
        const dungeonLink = `<a href="${buildPageHref(`dungeons/${encodedName}`)}">${dungeonName}</a>`;
        tableHtml += `<tr><td>${dungeonLink}</td><td>${entry.sources}</td></tr>`;
    }
    tableHtml += '</tbody></table>';

    return `<div class="content-beside-infobox">${tableHtml}</div>`;
}