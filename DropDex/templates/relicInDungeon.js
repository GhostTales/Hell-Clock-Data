import { getGameData } from '../data.js';
import { calculateModifiedRelicWeights, DungeonConfigNameShorthandMap } from './utils.js';

/**
 * Creates an HTML list of Dungeons that contain a specific relic, including combined drop chances based on devotion points.
 * @param {object} relic - The relic data object.
 * @param {Array<object>} allDungeons - All dungeon data.
 * @param {Array<object>} allTreasureClasses - All treasure class data.
 * @param {Array<object>} allRelics - All relic data (needed for devotion calculations).
 * @returns {Promise<string>} HTML string for the list.
 */
export async function createRelicInDungeonTemplate(relic, allDungeons, allTreasureClasses, allRelics) {
    if (!relic) {
        return '<span class="error">[Relic not found]</span>';
    }

    const furyPoints = parseInt(document.getElementById('furyPoints')?.value, 10) || 0;
    const faithPoints = parseInt(document.getElementById('faithPoints')?.value, 10) || 0;
    const disciplinePoints = parseInt(document.getElementById('disciplinePoints')?.value, 10) || 0;

    const devotions = {
        "Fury": furyPoints,
        "Faith": faithPoints,
        "Discipline": disciplinePoints
    };

    const devotionColorMap = {
        "Fury": "red",
        "Faith": "blue",
        "Discipline": "green"
    };

    const maxDevotion = Math.max(...Object.values(devotions));
    const highestDevotions = Object.keys(devotions).filter(key => devotions[key] === maxDevotion);
    
    let devotionBonus = 1;
    let highestDevotionType = null;

    if (highestDevotions.length === 1 && maxDevotion > 4) {
        highestDevotionType = highestDevotions[0];
        const amount_points = maxDevotion - 4;
        devotionBonus = 2 + 0.1 * amount_points;
    }

    const dungeonRowsData = [];

    for (const dungeon of allDungeons) {
        let combinedBaseChance = 0;
        let combinedYourChance = 0;
        let dungeonMaxTier = 'N/A';
        let dungeonMaxTierChance = 0;

        if (dungeon.dropBalance && Array.isArray(dungeon.dropBalance.floorDropConfigs)) {
            for (const floorConfig of dungeon.dropBalance.floorDropConfigs) {
                const tcRefs = {
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
                    ...floorConfig.chestTreasureClass // Spread chest TCs if they exist
                };

                for (const key in tcRefs) {
                    const tcRef = tcRefs[key];
                    if (tcRef && tcRef.id !== undefined) {
                        const tc = allTreasureClasses.find(t => t.id === tcRef.id);
                        if (tc && tc.availableRelics && tc.availableRelics.some(r => r.value.id === relic.id)) {
                            const baseTotalWeight = tc.availableRelics.reduce((sum, r) => sum + r.weight, 0);
                            const relicEntry = tc.availableRelics.find(r => r.value.id === relic.id);
                            
                            if (relicEntry) {
                                const baseChance = baseTotalWeight > 0 ? (relicEntry.weight / baseTotalWeight) * 100 : 0;
                                combinedBaseChance += baseChance;

                                const modifiedRelicWeights = calculateModifiedRelicWeights(tc.availableRelics, allRelics, devotions, devotionColorMap, highestDevotionType, devotionBonus);
                                const yourTotalWeight = modifiedRelicWeights.reduce((sum, r) => sum + r.weight, 0);
                                const yourRelicWeight = modifiedRelicWeights.find(r => r.id === relic.id)?.weight || 0;
                                const yourChance = yourTotalWeight > 0 ? (yourRelicWeight / yourTotalWeight) * 100 : 0;
                                combinedYourChance += yourChance;

                                if (tc.tiers && tc.tiers.length > 0) {
                                    const currentMaxTier = Math.max(...tc.tiers.map(t => t.value));
                                    if (currentMaxTier > dungeonMaxTier || dungeonMaxTier === 'N/A') {
                                        dungeonMaxTier = currentMaxTier;
                                        const totalTierWeight = tc.tiers.reduce((sum, t) => sum + t.weight, 0);
                                        const maxTierEntry = tc.tiers.find(t => t.value === dungeonMaxTier);
                                        dungeonMaxTierChance = (maxTierEntry && totalTierWeight > 0) ? (maxTierEntry.weight / totalTierWeight) * 100 : 0;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (combinedBaseChance > 0) {
            dungeonRowsData.push({
                dungeonName: DungeonConfigNameShorthandMap[dungeon.name] || dungeon.name,
                maxTier: dungeonMaxTier,
                dungeonInternalName: dungeon.name,
                maxTierChance: dungeonMaxTierChance,
                baseChance: combinedBaseChance,
                yourChance: combinedYourChance
            });
        }
    }

    if (dungeonRowsData.length === 0) {
        return `<p>This relic is not found in any dungeon's treasure classes.</p>`;
    }

    dungeonRowsData.sort((a, b) => {
        const tierA = a.maxTier === 'N/A' ? -1 : a.maxTier;
        const tierB = b.maxTier === 'N/A' ? -1 : b.maxTier;

        if (tierB !== tierA) {
            return tierB - tierA; // Sort by max tier descending
        }

        if (b.yourChance !== a.yourChance) {
            return b.yourChance - a.yourChance; // Then by your chance descending
        }

        return b.maxTierChance - a.maxTierChance; // Finally by max tier chance descending
    });

    let html = '<table class="relic-list-table"><thead><tr><th>Dungeon</th><th>Max Tier</th><th>Max Tier Chance</th><th>Base Chance</th><th>Your Chance</th></tr></thead><tbody>';

    for (const row of dungeonRowsData) {
        const encodedDungeonName = encodeURIComponent(row.dungeonInternalName);
        const dungeonLink = `<a href="?page=dungeons/${encodedDungeonName}">${row.dungeonName}</a>`;
        html += `<tr>
            <td>${dungeonLink}</td>
            <td>${row.maxTier}</td>
            <td>${row.maxTier !== 'N/A' ? row.maxTierChance.toFixed(2) + '%' : 'N/A'}</td>
            <td>${row.baseChance.toFixed(2)}%</td>
            <td>${row.yourChance.toFixed(2)}%</td>
        </tr>`;
    }

    html += '</tbody></table>';
    
    if (highestDevotionType) {
        html += `<p style="font-size: 0.9em;"><i>Your highest devotion is ${highestDevotionType}, applying a ${devotionBonus.toFixed(2)}x weight multiplier.</i></p>`;
    } else if (highestDevotions.length > 1 && maxDevotion > 4) {
        html += `<p style="font-size: 0.9em;"><i>Multiple devotions are tied for the highest value, so no bonus is applied.</i></p>`;
    }

    return html;
}