import { getGameData } from '../data.js';
import { getEnLoc, nonUniqueRelicIconMap, devotionColorMap, relicSizeMap } from './utils.js';
import { formatAffixDescription } from './formatters.js';

/**
 * Creates an HTML template for a relic.
 * @param {object} relic - The relic data object.
 * @param {Array<object>} allAffixData - All affix data.
 * @param {Array<object>} allSkillsData - All skills data.
 * @returns {Promise<string>} HTML string for the relic info box.
 */
export async function createRelicTemplate(relic, allAffixData, allSkillsData) {
    if (!relic) {
        return '<span class="error">[Relic not found]</span>';
    }

    const name = getEnLoc(relic.nameLocalizationKey) || relic.name;
    const lore = getEnLoc(relic.loreLocalizationKey);

    let spriteNames = relic.sprite;
    if (!spriteNames && nonUniqueRelicIconMap[relic.name]) {
        spriteNames = nonUniqueRelicIconMap[relic.name];
    }

    let iconContainerHtml = '';
    if (spriteNames) {
        const spriteNameArray = Array.isArray(spriteNames) ? spriteNames : [spriteNames];
        let imagesHtml = '';
        spriteNameArray.forEach(spriteName => {
            const iconPath = `https://raw.githubusercontent.com/RogueSnail/hellclock-data-export/main/icons/${spriteName}.png`;
            imagesHtml += `<img src="${iconPath}" alt="${name}" style="width: 128px; height: 128px;" onerror="this.style.display='none'"> `;
        });
        iconContainerHtml = `<div class="infobox-image" style="text-align: center; padding: 10px 0;">${imagesHtml.trim()}</div>`;
    }

    const processIntrinsicAffixes = (affixes) => {
        if (!affixes || affixes.length === 0) return '';
        let html = `<h4>Intrinsic Affixes</h4><ul>`;
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

    let affixesHtml = '';
    affixesHtml += processIntrinsicAffixes(relic.intrinsicAffixes);

    let availabilityHtml = '';
    let conditionsList = '';
    if (relic.availabilityConditions && relic.availabilityConditions.conditionsConfigList && relic.availabilityConditions.conditionsConfigList.length > 0) {
        relic.availabilityConditions.conditionsConfigList.forEach(cond => {
            if (cond.condition.includes("Devotion Condition")) {
                conditionsList += `<li>Requires ${cond.targetValue} ${devotionColorMap[cond.required_devotion.toLowerCase()]} Devotion</li>`;
            } else if (cond.condition === "Is Skill Available Condition") {
                const skillId = parseInt(cond.targetValue, 10);
                const skill = allSkillsData.find(s => s.id === skillId);
                const skillName = skill ? getEnLoc(skill.localizedName) || skill.name : `ID ${cond.targetValue}`;
                conditionsList += `<li>Requires the skill ${skillName} to be unlocked</li>`;
            } else if (cond.condition === "Has Cursed War DLC Condition") {
                conditionsList += `<li>Requires The Cursed War DLC</li>`;
            }
        });
    }

    if (relic.relicTypes && Array.isArray(relic.relicTypes) && relic.relicTypes.includes('Nightmare')) {
        conditionsList += `<li>Can only be obtained from Nightmare Portals</li>`;
    }

    if (conditionsList) {
        availabilityHtml = `
            <div class="infobox-affixes" style="padding: 0 15px 10px;">
                <h4>Availability</h4>
                <ul>${conditionsList}</ul>
            </div>
        `;
    }

    return `
        <div class="infobox relic-infobox">
            <div class="infobox-header">${name}</div>
            ${iconContainerHtml}
            <div class="infobox-content" style="padding: 0 5px;">
                <div class="infobox-description">
                    ${relic.eRelicSize ? `<p style="margin: 4px 0;"><b>Size:</b> ${relicSizeMap[relic.eRelicSize]}</p>` : ''}
                    ${relic.relicTypes && Array.isArray(relic.relicTypes) && relic.relicTypes.length > 0 ? `<p style="margin: 4px 0;"><b>Relic Type:</b> ${relic.relicTypes.join(', ')}</p>` : ''}
                    ${relic.devotionAffinity && relic.devotionAffinity.length > 0 ? `<p style="margin: 4px 0;"><b>Devotion:</b> ${relic.devotionAffinity.map(color => devotionColorMap[color.toLowerCase()]).join(', ')}</p>` : ''}
                </div>
            </div>
            <div class="infobox-affixes" style="padding: 0 15px 10px;">
                ${affixesHtml}
            </div>
            ${availabilityHtml}
            <div style="padding: 0 5px;">
                ${lore ? `<p><em>"${lore}"</em></p>` : ''}
            </div>
            <div class="infobox-footer">ID: ${relic.id}</div>
        </div>
    `;
}