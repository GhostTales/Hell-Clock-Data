import { calculateModifiedRelicWeights, devotionColorMap, getDevotionBonusContext } from './utils.js';
import { buildPageHref } from '../routes.js';

/**
 * Creates an HTML list of Treasure Classes that can drop a specific relic, including drop chances based on devotion points.
 * @param {object} relic - The relic data object.
 * @param {Array<object>} allTreasureClasses - All treasure class data.
 * @param {Array<object>} allRelics - All relic data.
 * @returns {Promise<string>} HTML string for the list.
 */
export async function createRelicInTreasureTemplate(relic, allTreasureClasses, allRelics) {
    if (!relic) {
        return '<span class="error">[Relic not found]</span>';
    }

    const {
        devotions,
        maxDevotion,
        highestDevotions,
        highestDevotionType,
        devotionBonus,
    } = getDevotionBonusContext({
        furyPoints: document.getElementById('furyPoints')?.value,
        faithPoints: document.getElementById('faithPoints')?.value,
        disciplinePoints: document.getElementById('disciplinePoints')?.value,
    });

    const containingTCs = allTreasureClasses.filter(tc => 
        tc.availableRelics && tc.availableRelics.some(r => r.value.id === relic.id)
    );

    if (containingTCs.length === 0) {
        return `<p>This relic is not found in any treasure class's direct drop table.</p>`;
    }

    const tableRowsData = [];

    for (const tc of containingTCs) {
        const baseTotalWeight = tc.availableRelics.reduce((sum, r) => sum + r.weight, 0);
        const relicEntry = tc.availableRelics.find(r => r.value.id === relic.id);
        
        if (!relicEntry) continue;

        const baseChance = baseTotalWeight > 0 ? (relicEntry.weight / baseTotalWeight) * 100 : 0;

        // Create a new array of relics with devotion bonuses applied to their weights.
        const modifiedRelicWeights = calculateModifiedRelicWeights(tc.availableRelics, allRelics, devotions, devotionColorMap, highestDevotionType, devotionBonus);

        // Calculate the new total weight from the modified weights.
        const yourTotalWeight = modifiedRelicWeights.reduce((sum, r) => sum + r.weight, 0);
        
        // Find the specific relic's new weight from the modified list.
        const yourRelicWeight = modifiedRelicWeights.find(r => r.id === relic.id)?.weight || 0;

        const yourChance = yourTotalWeight > 0 ? (yourRelicWeight / yourTotalWeight) * 100 : 0;
        
        const encodedTcName = encodeURIComponent(tc.name);
        const tcLink = `<a href="${buildPageHref(`treasure_classes/${encodedTcName}`)}">${tc.name}</a>`;

        const maxTier = (tc.tiers && tc.tiers.length > 0) 
            ? Math.max(...tc.tiers.map(t => t.value)) 
            : 'N/A';

        let maxTierChance = 0;
        if (maxTier !== 'N/A' && tc.tiers) {
            const totalTierWeight = tc.tiers.reduce((sum, t) => sum + t.weight, 0);
            const maxTierEntry = tc.tiers.find(t => t.value === maxTier);
            if (maxTierEntry && totalTierWeight > 0) {
                maxTierChance = (maxTierEntry.weight / totalTierWeight) * 100;
            }
        }
        
        tableRowsData.push({
            tcLink,
            maxTier,
            baseChance,
            maxTierChance,
            yourChance
        });
    }

    tableRowsData.sort((a, b) => {
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

    let html = '<table class="relic-list-table"><thead><tr><th>Treasure Class</th><th>Max Tier</th><th>Max Tier Chance</th><th>Base Chance</th><th>Your Chance</th></tr></thead><tbody>';

    for (const row of tableRowsData) {
        html += `<tr>
            <td>${row.tcLink}</td>
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