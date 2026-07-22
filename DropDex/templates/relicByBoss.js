import { getGameData } from '../data.js';
import { calculateModifiedRelicWeights, DungeonConfigNameShorthandMap, devotionColorMap } from './utils.js';
import { dungeonToBossTCs, nightmareRelicBossTCs } from './dungeonBossMap.js';

/**
 * Creates an HTML table row for a dungeon's boss drops.
 * @param {object} row - The dungeon row data.
 * @returns {string} HTML string for the table row.
 */
function createRowHtml(row) {
    const encodedDungeonName = encodeURIComponent(row.dungeonInternalName);
    const dungeonLink = `<a href="?page=dungeons/${encodedDungeonName}">${row.dungeonName}</a>`;
    return `<tr>
        <td>${dungeonLink}</td>
        <td>${row.maxTier}</td>
        <td>${row.maxTier !== 'N/A' ? row.maxTierChance.toFixed(2) + '%' : 'N/A'}</td>
        <td>${row.baseChance > 0 ? row.baseChance.toFixed(2) + '%' : 'N/A'}</td>
        <td>${row.yourChance.toFixed(2)}%</td>
    </tr>`;
}

/**
 * Creates an HTML table for a given set of boss drop rows.
 * @param {string} title - The title for the table section.
 * @param {Array<object>} rows - The sorted rows of data to display.
 * @param {boolean} isCollapsible - Whether the table body should be collapsible.
 * @param {string} collapseId - The ID for the collapsible tbody.
 * @returns {string} The generated HTML string for the table.
 */
function createTableHtml(title, rows, isCollapsible = false, collapseId = '') {
    if (rows.length === 0) {
        return '';
    }

    let html = `<h3 class="tool-heading">${title}</h3>`;
    html += '<table class="relic-list-table"><thead><tr><th>Dungeon</th><th>Max Tier</th><th>Max Tier Chance</th><th>Base Chance</th><th>Your Chance</th></tr></thead>';

    if (isCollapsible) {
        html += `<tbody class="collapsible-content" id="${collapseId}" style="display: none;">`;
    } else {
        html += '<tbody>';
    }

    for (const row of rows) {
        html += createRowHtml(row);
    }
    html += '</tbody>';

    if (isCollapsible) {
        html += `<tfoot><tr><td colspan="5" class="accordion-toggle" onclick="toggleAccordion('${collapseId}', this)" data-alternate-text="Show Less Campaign Dungeons &#9652;">Show Other Campaign Dungeons &#9662;</td></tr></tfoot>`;
    }

    html += '</table>';
    return html;
}

/**
 * Recursively calculates the drop chance of a relic within a treasure class.
 * @param {object} tc - The treasure class to check.
 * @param {number} relicId - The ID of the relic to find.
 * @param {Array<object>} allTreasureClasses - All treasure class data.
 * @param {Array<object>} allRelics - All relic data (needed for devotion calculations).
 * @param {object} devotions - Current devotion points.
 * @param {object} devotionColorMap - Mapping of devotion types to colors.
 * @param {string|null} highestDevotionType - The type of the highest devotion.
 * @param {number} devotionBonus - The calculated devotion bonus.
 * @returns {number} The calculated chance (as a percentage).
 */
function getRelicDropChanceInTc(tc, relicId, allTreasureClasses, allRelics, devotions, devotionColorMap, highestDevotionType, devotionBonus) {
    if (!tc) return 0;

    // Case 1: The TC directly contains relics (e.g., RelicTreasureClass, UniqueRelicTreasureClass)
    if (tc.availableRelics && tc.availableRelics.length > 0) {
        if (tc.availableRelics.some(r => r.value.id === relicId)) {
            const modifiedRelicWeights = calculateModifiedRelicWeights(tc.availableRelics, allRelics, devotions, devotionColorMap, highestDevotionType, devotionBonus);
            const yourTotalWeight = modifiedRelicWeights.reduce((sum, r) => sum + r.weight, 0);
            const yourRelicWeight = modifiedRelicWeights.find(r => r.id === relicId)?.weight || 0;
            return yourTotalWeight > 0 ? (yourRelicWeight / yourTotalWeight) * 100 : 0;
        }
        return 0; // Relic not directly in this TC
    }

    let totalWeightedChance = 0;
    let totalWeight = 0;

    // Case 2: The TC contains other Treasure Classes (e.g., LootGroupTreasureClass)
    if (tc.availableTreasureClasses && tc.availableTreasureClasses.length > 0) {
        for (const subTcItem of tc.availableTreasureClasses) {
            const subTcRef = subTcItem.value.treasureClass || subTcItem.value; // Handle slight variations in structure
            const subTc = allTreasureClasses.find(t => t.id === subTcRef?.id);
            if (subTc) {
                const chanceInSubTc = getRelicDropChanceInTc(subTc, relicId, allTreasureClasses, allRelics, devotions, devotionColorMap, highestDevotionType, devotionBonus);
                totalWeightedChance += chanceInSubTc * subTcItem.weight;
                totalWeight += subTcItem.weight;
            }
        }
        return totalWeight > 0 ? totalWeightedChance / totalWeight : 0;
    }

    // Case 3: The TC is a BlessingLootTreasureClass
    if (tc.treasureClassPool && tc.treasureClassPool.length > 0) {
        let sumOfChancesFromAllLists = 0;
        for (const poolItem of tc.treasureClassPool) {
            if (poolItem.availableTreasureClasses && poolItem.availableTreasureClasses.length > 0) {
                let currentListTotalWeight = 0;
                let currentListWeightedChance = 0;

                for (const subTcItem of poolItem.availableTreasureClasses) {
                    const subTc = allTreasureClasses.find(t => t.id === subTcItem.value?.id);
                    if (subTc) {
                    // Per user feedback, ignore any treasure class that is specifically for a "First Time" reward,
                    // as these are not part of the regular, repeatable drop pool.
                    if (subTc.name.includes("First Time")) {
                        continue;
                    }
                        const chanceInSubTc = getRelicDropChanceInTc(subTc, relicId, allTreasureClasses, allRelics, devotions, devotionColorMap, highestDevotionType, devotionBonus);
                        currentListWeightedChance += chanceInSubTc * subTcItem.weight;
                        currentListTotalWeight += subTcItem.weight;
                    }
                }
                if (currentListTotalWeight > 0) {
                    sumOfChancesFromAllLists += currentListWeightedChance / currentListTotalWeight;
                }
            }
        }
        return sumOfChancesFromAllLists;
    }

    return 0;
}

/**
 * Recursively finds all BlessingLootTreasureClass instances within a given Treasure Class,
 * calculates the relic drop chance and tier info for each, and returns them.
 * @param {object} tc - The treasure class to search within.
 * @param {object} relic - The relic to find.
 * @param {Array<object>} allTreasureClasses - All treasure class data.
 * @param {Array<object>} allRelics - All relic data.
 * @param {object} devotionData - An object containing all devotion-related parameters.
 * @returns {Array<object>} An array of found boss blessing drops with their chances and tier info.
 */
function findBlessingDropsInTc(tc, relic, allTreasureClasses, allRelics, devotionData) {
    if (!tc) {
        return [];
    }

    // Base Case: If this TC is a BlessingLootTreasureClass, calculate its chance and return.
    if (tc.type === "BlessingLootTreasureClass") {
        const baseChance = getRelicDropChanceInTc(tc, relic.id, allTreasureClasses, allRelics, {}, {}, null, 1);
        const yourChance = getRelicDropChanceInTc(tc, relic.id, allTreasureClasses, allRelics, devotionData.devotions, devotionData.devotionColorMap, devotionData.highestDevotionType, devotionData.devotionBonus);

        if (yourChance > 0) {
            let maxTier = 'N/A';
            let maxTierChance = 0;

            // Recursive function to find the highest tier among the sub-classes that drop the relic
            const findTier = (innerTc) => {
                if (!innerTc) return;
                if (innerTc.availableRelics && innerTc.availableRelics.some(r => r.value.id === relic.id)) {
                    if (innerTc.tiers && innerTc.tiers.length > 0) {
                        const currentMaxTier = Math.max(...innerTc.tiers.map(t => t.value));
                        if (maxTier === 'N/A' || currentMaxTier > maxTier) {
                            maxTier = currentMaxTier;
                            const totalTierWeight = innerTc.tiers.reduce((sum, t) => sum + t.weight, 0);
                            const maxTierEntry = innerTc.tiers.find(t => t.value === maxTier);
                            maxTierChance = (maxTierEntry && totalTierWeight > 0) ? (maxTierEntry.weight / totalTierWeight) * 100 : 0;
                        }
                    }
                }
                if (innerTc.availableTreasureClasses) {
                    for (const subItem of innerTc.availableTreasureClasses) {
                        const subTc = allTreasureClasses.find(t => t.id === (subItem.value.treasureClass?.id || subItem.value?.id));
                        findTier(subTc);
                    }
                }
                if (innerTc.treasureClassPool) {
                    for (const poolItem of innerTc.treasureClassPool) {
                        for (const subTcItem of poolItem.availableTreasureClasses) {
                            const subTc = allTreasureClasses.find(t => t.id === subTcItem.value?.id);
                            findTier(subTc);
                        }
                    }
                }
            };
            
            findTier(tc);

            return [{ baseChance, yourChance, maxTier, maxTierChance }];
        }
        return [];
    }

    // Recursive Step: Look in sub-tables.
    let results = [];
    if (tc.availableTreasureClasses) {
        for (const subTcItem of tc.availableTreasureClasses) {
            const subTcRef = subTcItem.value.treasureClass || subTcItem.value;
            const subTc = allTreasureClasses.find(t => t.id === subTcRef?.id);
            results.push(...findBlessingDropsInTc(subTc, relic, allTreasureClasses, allRelics, devotionData));
        }
    }
    return results;
}

/**
 * Creates an HTML list of boss drop chances for a specific relic.
 * @param {object} relic - The relic data object.
 * @param {Array<object>} allDungeons - All dungeon data.
 * @param {Array<object>} allTreasureClasses - All treasure class data.
 * @param {Array<object>} allRelics - All relic data (needed for devotion calculations).
 * @param {object} devotionPoints - Current devotion points.
 * @returns {Promise<string>} HTML string for the list.
 */
export async function createRelicByBossTemplate(relic, allDungeons, allTreasureClasses, allRelics, devotionPoints = {}) {
    if (!relic) {
        return '<span class="error">[Relic not found]</span>';
    }

    const furyPoints = devotionPoints.furyPoints || 0;
    const faithPoints = devotionPoints.faithPoints || 0;
    const disciplinePoints = devotionPoints.disciplinePoints || 0;

    const devotions = { "Fury": furyPoints, "Faith": faithPoints, "Discipline": disciplinePoints };
    const devotionColorMap = { "Fury": "red", "Faith": "blue", "Discipline": "green" };
    const maxDevotion = Math.max(...Object.values(devotions));
    const highestDevotions = Object.keys(devotions).filter(key => devotions[key] === maxDevotion);
    
    let devotionBonus = 1;
    let highestDevotionType = null;

    if (highestDevotions.length === 1 && maxDevotion > 4) {
        highestDevotionType = highestDevotions[0];
        const amount_points = maxDevotion - 4;
        devotionBonus = 2 + 0.1 * amount_points;
    }

    const devotionData = { devotions, devotionColorMap, highestDevotionType, devotionBonus };

    const campaignNormalRows = [];
    const campaignOtherRows = [];
    const endlessDungeonRows = [];
    const ascensionDungeonRows = [];
    const campaignRegex = /^Act\d{2}_DungeonConfig$/;

    // Loop through all dungeons to find and categorize boss drops
    for (const dungeon of allDungeons) {
        let bossTcNames;
        // Override for "Nightmare" type relics, which use special Treasure Classes.
        // The relic type is stored in the `relicTypes` array.
        if (relic.relicTypes && relic.relicTypes.includes('Nightmare')) {
            bossTcNames = [];
            const isNormalCampaign = campaignRegex.test(dungeon.name);

            if (isNormalCampaign) {
                const actMatch = dungeon.name.match(/^Act(\d{2})/);
                if (actMatch) {
                    const actKey = `Act${actMatch[1]}`;
                    if (nightmareRelicBossTCs.campaign[actKey]) {
                        bossTcNames.push(nightmareRelicBossTCs.campaign[actKey]);
                    }
                }
            } else { // Everything else (Endless, Ascension, other campaign difficulties)
                bossTcNames.push(nightmareRelicBossTCs.other);
            }
        } else {
            bossTcNames = dungeonToBossTCs[dungeon.name] || [];
        }
        let foundBossDrops = [];

        if (bossTcNames.length > 0) {
            for (const topLevelBossTcName of new Set(bossTcNames)) {
                const topLevelBossTc = allTreasureClasses.find(t => t.name === topLevelBossTcName);
                foundBossDrops.push(...findBlessingDropsInTc(topLevelBossTc, relic, allTreasureClasses, allRelics, devotionData));
            }
        }

        if (foundBossDrops.length > 0) {
            // Combine all chances and find the max tier for the dungeon
            const combinedBaseChance = foundBossDrops.reduce((sum, drop) => sum + drop.baseChance, 0);
            const combinedYourChance = foundBossDrops.reduce((sum, drop) => sum + drop.yourChance, 0);

            let dungeonMaxTier = 'N/A';
            let dungeonMaxTierChance = 0;

            for (const drop of foundBossDrops) {
                if (drop.maxTier !== 'N/A' && (dungeonMaxTier === 'N/A' || drop.maxTier > dungeonMaxTier)) {
                    dungeonMaxTier = drop.maxTier;
                    dungeonMaxTierChance = drop.maxTierChance;
                }
            }

            const rowData = {
                dungeonId: dungeon.id,
                dungeonName: DungeonConfigNameShorthandMap[dungeon.name] || dungeon.name,
                dungeonInternalName: dungeon.name,
                maxTier: dungeonMaxTier,
                maxTierChance: dungeonMaxTierChance,
                baseChance: combinedBaseChance,
                yourChance: combinedYourChance
            };

            // Categorize dungeon
            if (dungeon.name.startsWith('Nightmare')) {
                endlessDungeonRows.push(rowData);
            } else if (dungeon.name.includes('_Endgame_')) {
                ascensionDungeonRows.push(rowData);
            } else if (campaignRegex.test(dungeon.name)) {
                campaignNormalRows.push(rowData);
            } else if (dungeon.name.startsWith('Act')) {
                campaignOtherRows.push(rowData);
            }
        }
    }

    const allRows = [...campaignNormalRows, ...campaignOtherRows, ...endlessDungeonRows, ...ascensionDungeonRows];
    if (allRows.length === 0) {
        return '<p>This relic does not drop from any boss blessing screens.</p>';
    }

    // Sort rows within each category
    campaignNormalRows.sort((a, b) => a.dungeonId - b.dungeonId);
    campaignOtherRows.sort((a, b) => a.dungeonId - b.dungeonId);
    ascensionDungeonRows.sort((a, b) => a.dungeonId - b.dungeonId);
    endlessDungeonRows.sort((a, b) => {
        const tierA = parseInt(a.dungeonName.substring(1));
        const tierB = parseInt(b.dungeonName.substring(1));
        return tierA - tierB;
    });

    let html = '<h3 class="tool-heading">Boss Blessing Drop Chances</h3>';
    
    html += createTableHtml('Campaign', campaignNormalRows);
    html += createTableHtml('Endless Nightmares', endlessDungeonRows);
    html += createTableHtml('Ascension', ascensionDungeonRows);
    html += createTableHtml('Other Campaign Dungeons', campaignOtherRows, true, 'boss-campaign-other-dungeons');

    if (highestDevotionType) {
        html += `<p style="font-size: 0.9em;"><i>Your highest devotion is ${highestDevotionType}, applying a ${devotionBonus.toFixed(2)}x weight multiplier.</i></p>`;
    } else if (highestDevotions.length > 1 && maxDevotion > 4) {
        html += `<p style="font-size: 0.9em;"><i>Multiple devotions are tied for the highest value, so no bonus is applied.</i></p>`;
    }

    return html;
}