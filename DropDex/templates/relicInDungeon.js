import { calculateModifiedRelicWeights, DungeonConfigNameShorthandMap, devotionColorMap, getDevotionBonusContext, getFloorTreasureClassRefs } from './utils.js';
import { buildPageHref } from '../routes.js';

/**
 * Creates an HTML table row for a dungeon.
 * @param {object} row - The dungeon row data.
 * @returns {string} HTML string for the table row.
 */
function createRowHtml(row) {
    const encodedDungeonName = encodeURIComponent(row.dungeonInternalName);
    const dungeonLink = `<a href="${buildPageHref(`dungeons/${encodedDungeonName}`)}">${row.dungeonName}</a>`;
    return `<tr>
        <td>${dungeonLink}</td>
        <td>${row.maxTier}</td>
        <td>${row.maxTier !== 'N/A' ? row.maxTierChance.toFixed(2) + '%' : 'N/A'}</td>
        <td>${row.baseChance.toFixed(2)}%</td>
        <td>${row.yourChance.toFixed(2)}%</td>
    </tr>`;
}

/**
 * Creates an HTML list of Dungeons that contain a specific relic, including combined drop chances based on devotion points.
 * @param {object} relic - The relic data object.
 * @param {Array<object>} allDungeons - All dungeon data.
 * @param {Array<object>} allTreasureClasses - All treasure class data.
 * @param {Array<object>} allRelics - All relic data (needed for devotion calculations).
 * @returns {Promise<string>} HTML string for the list.
 */
export async function createRelicInDungeonTemplate(relic, allDungeons, allTreasureClasses, allRelics, devotionPoints = {}) {
    if (!relic) {
        return '<span class="error">[Relic not found]</span>';
    }

    const {
        devotions,
        maxDevotion,
        highestDevotions,
        highestDevotionType,
        devotionBonus,
    } = getDevotionBonusContext(devotionPoints);

    const campaignNormalRows = [];
    const campaignOtherRows = [];
    const endlessDungeonRows = [];
    const ascensionDungeonRows = [];
    const campaignRegex = /^Act\d{2}_DungeonConfig$/;


    for (const dungeon of allDungeons) {
        let combinedBaseChance = 0;
        let combinedYourChance = 0;
        let dungeonMaxTier = 'N/A';
        let dungeonMaxTierChance = 0;

        if (dungeon.dropBalance && Array.isArray(dungeon.dropBalance.floorDropConfigs)) {
            for (const floorConfig of dungeon.dropBalance.floorDropConfigs) {
                const tcRefs = getFloorTreasureClassRefs(floorConfig);

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
            const rowData = {
                dungeonId: dungeon.id,
                dungeonName: DungeonConfigNameShorthandMap[dungeon.name] || dungeon.name,
                maxTier: dungeonMaxTier,
                dungeonInternalName: dungeon.name,
                maxTierChance: dungeonMaxTierChance,
                baseChance: combinedBaseChance,
                yourChance: combinedYourChance
            };

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

    if (campaignNormalRows.length === 0 && campaignOtherRows.length === 0 && endlessDungeonRows.length === 0 && ascensionDungeonRows.length === 0) {
        return `<p>This relic is not found in any dungeon's treasure classes.</p>`;
    }

    let html = '';

    // Campaign (Normal) Table
    html += '<h3 class="tool-heading">Campaign</h3>';
    if (campaignNormalRows.length > 0) {
        html += '<table class="relic-list-table"><thead><tr><th>Dungeon</th><th>Max Tier</th><th>Max Tier Chance</th><th>Base Chance</th><th>Your Chance</th></tr></thead>';
        campaignNormalRows.sort((a, b) => a.dungeonId - b.dungeonId);
        html += '<tbody>';
        for (const row of campaignNormalRows) {
            html += createRowHtml(row);
        }
        html += '</table>';
    } else {
        if (campaignOtherRows.length === 0) {
            html += '<p>This relic does not drop from any Campaign dungeons.</p>';
        } else {
            html += '<p>This relic does not drop from normal Campaign difficulties.</p>';
        }
    }

    // Endless Nightmares Table
    if (endlessDungeonRows.length > 0) {
        html += '<h3 class="tool-heading">Endless Nightmares</h3>';
        endlessDungeonRows.sort((a, b) => {
            const tierA = parseInt(a.dungeonName.substring(1));
            const tierB = parseInt(b.dungeonName.substring(1));
            return tierA - tierB;
        });
        html += '<table class="relic-list-table"><thead><tr><th>Dungeon</th><th>Max Tier</th><th>Max Tier Chance</th><th>Base Chance</th><th>Your Chance</th></tr></thead><tbody>';
        for (const row of endlessDungeonRows) {
            html += createRowHtml(row);
        }
        html += '</tbody></table>';
    }
    
    // Ascension Table
    if (ascensionDungeonRows.length > 0) {
        html += '<h3 class="tool-heading">Ascension</h3>';
        ascensionDungeonRows.sort((a, b) => a.dungeonId - b.dungeonId);
        html += '<table class="relic-list-table"><thead><tr><th>Dungeon</th><th>Max Tier</th><th>Max Tier Chance</th><th>Base Chance</th><th>Your Chance</th></tr></thead><tbody>';
        for (const row of ascensionDungeonRows) {
            html += createRowHtml(row);
        }
        html += '</tbody></table>';
    }

    // Other Campaign Dungeons
    if (campaignOtherRows.length > 0) {
        html += '<h3 class="tool-heading">Other Campaign Dungeons</h3>';
        html += '<table class="relic-list-table"><thead><tr><th>Dungeon</th><th>Max Tier</th><th>Max Tier Chance</th><th>Base Chance</th><th>Your Chance</th></tr></thead>';
        html += '<tbody class="collapsible-content" id="campaign-other-dungeons" style="display: none;">';
        campaignOtherRows.sort((a, b) => a.dungeonId - b.dungeonId);
        for (const row of campaignOtherRows) {
            html += createRowHtml(row);
        }
        html += '</tbody>';
        html += '<tfoot><tr><td colspan="5" class="accordion-toggle" onclick="toggleAccordion(\'campaign-other-dungeons\', this)" data-alternate-text="Show Less Campaign Dungeons &#9652;">Show Other Campaign Dungeons &#9662;</td></tr></tfoot>';
        html += '</table>';
    }
    
    if (highestDevotionType) {
        html += `<p style="font-size: 0.9em;"><i>Your highest devotion is ${highestDevotionType}, applying a ${devotionBonus.toFixed(2)}x weight multiplier.</i></p>`;
    } else if (highestDevotions.length > 1 && maxDevotion > 4) {
        html += `<p style="font-size: 0.9em;"><i>Multiple devotions are tied for the highest value, so no bonus is applied.</i></p>`;
    }

    return html;
}