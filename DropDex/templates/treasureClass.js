import { getEnLoc } from './utils.js';
import { buildPageHref } from '../routes.js';

/**
 * Creates an HTML template for a Treasure Class.
 * @param {object} tc - The Treasure Class data object.
 * @param {Array<object>} allTCs - All treasure class data.
 * @param {Array<object>} allRelics - All relic data.
 * @returns {Promise<string>} HTML string for the treasure class info box.
 */
export async function createTreasureClassTemplate(tc, allTCs, allRelics) {
    if (!tc) {
        return '<span class="error">[Treasure Class not found]</span>';
    }

    const name = tc.name;

    let detailsHtml = `<p style="margin: 4px 0;"><b>Type:</b> ${tc.type}</p>`;
    if (tc.amount) {
        detailsHtml += `<p style="margin: 4px 0;"><b>Amount:</b> ${tc.amount}</p>`;
    }

    let tierInfoHtml = '';
    if (tc.tiers && tc.tiers.length > 0) {
        const totalWeight = tc.tiers.reduce((sum, t) => sum + t.weight, 0);
        
        if (totalWeight > 0) {
            tierInfoHtml += '<h4>Tier Chances</h4>';
            tierInfoHtml += '<table class="relic-list-table"><thead><tr><th>Tier</th><th>Chance</th></tr></thead><tbody>';
            
            const sortedTiers = [...tc.tiers].sort((a, b) => a.value - b.value);

            for (const tier of sortedTiers) {
                const chance = (tier.weight / totalWeight) * 100;
                tierInfoHtml += `<tr><td>${tier.value}</td><td>${chance.toFixed(2)}%</td></tr>`;
            }
            tierInfoHtml += '</tbody></table>';
        }
    }

    let dropsHtml = '';
    if (tc.availableTreasureClasses && tc.availableTreasureClasses.length > 0) {
        dropsHtml += '<h4>Available Treasure Classes</h4>';
        dropsHtml += '<table class="relic-list-table"><thead><tr><th>Weight</th><th>Treasure Class</th><th>Amount Limit</th></tr></thead><tbody>';
        for (const item of tc.availableTreasureClasses) {
            const subTcId = item.value.treasureClass.id;
            const subTc = allTCs.find(t => t.id === subTcId);
            const subTcName = subTc ? subTc.name : item.value.treasureClass.name;
            const encodedName = encodeURIComponent(subTcName);
            const subTcLink = `<a href="${buildPageHref(`treasure_classes/${encodedName}`)}">${subTcName}</a>`;
            const amountLimit = item.value.useLimit ? `${item.value.amountLimit[0]} - ${item.value.amountLimit[1]}` : 'N/A';
            dropsHtml += `<tr><td>${item.weight.toFixed(1)}</td><td>${subTcLink}</td><td>${amountLimit}</td></tr>`;
        }
        dropsHtml += '</tbody></table>';
    }

    if (tc.availableGear && tc.availableGear.length > 0) {
        dropsHtml += '<h4>Available Gear</h4>';
        dropsHtml += '<table class="relic-list-table"><thead><tr><th>Weight</th><th>Gear</th><th>Slot</th><th>Tier</th></tr></thead><tbody>';
        for (const item of tc.availableGear) {
            const gearDef = item.value;
            const gearName = getEnLoc(gearDef.nameKey) || gearDef.name;
            dropsHtml += `<tr><td>${item.weight.toFixed(1)}</td><td>${gearName}</td><td>${gearDef.slot}</td><td>${gearDef.tier}</td></tr>`;
        }
        dropsHtml += '</tbody></table>';
    }
    
    if (tc.availableCurrencies && tc.availableCurrencies.length > 0) {
        dropsHtml += '<table class="relic-list-table"><thead><tr><th>Weight</th><th>Currency</th></tr></thead><tbody>';
        for (const item of tc.availableCurrencies) {
            const currencyName = item.value.currencyDefinition.name;
            const isFragment = item.value.isFragment ? ' fragment' : '';
            dropsHtml += `<tr><td>${item.weight.toFixed(1)}</td><td>${currencyName + isFragment}</td></tr>`;
        }
        dropsHtml += '</tbody></table>';
    }

    if (tc.availableRelics && tc.availableRelics.length > 0) {
        dropsHtml += '<h4>Available Relics</h4>';
        dropsHtml += '<table class="relic-list-table"><thead><tr><th>Weight</th><th>Relic</th></tr></thead><tbody>';
        for (const item of tc.availableRelics) {
            const relicDef = allRelics.find(r => r.id === item.value.id);
            const relicName = relicDef ? (getEnLoc(relicDef.nameLocalizationKey) || relicDef.name) : item.value.name;
            const encodedName = encodeURIComponent(relicName);
            dropsHtml += `<tr><td>${item.weight.toFixed(1)}</td><td><a href="${buildPageHref(`relics/${encodedName}`)}">${relicName}</a></td></tr>`;
        }
        dropsHtml += '</tbody></table>';
    }

    return `
        <div class="infobox treasure-class-infobox" style="float: right; margin: 0 0 1em 1em; clear: right;">
            <div class="infobox-header">${name}</div>
            <div class="infobox-content" style="padding: 0 5px;">
                ${detailsHtml}
            </div>
            <div class="infobox-drops" style="padding: 0 15px 10px;">
                ${tierInfoHtml}${dropsHtml}
            </div>
            <div class="infobox-footer">ID: ${tc.id}</div>
        </div>
    `;
}