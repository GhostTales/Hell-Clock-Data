import { getEnLoc, devotionColorMap } from './utils.js';

/**
 * Devotion category (as used by constellations) that a Constellation Node affix rolls its key node from.
 * The export does not include the affix's category, so it is derived from the relic's devotion affinity,
 * the same way the game groups hybrid categories.
 * @param {object} relic - The relic data object.
 * @param {object} groupedDevotionConfig - Hybrid category name -> list of base categories.
 * @returns {string} The constellation devotion category, e.g. "Red", "GreenBlue" or "Neutral".
 */
export function getConstellationCategoryForRelic(relic, groupedDevotionConfig = {}) {
    const affinity = relic.devotionAffinity || [];
    if (affinity.length === 0) return 'Neutral';
    if (affinity.length === 1) return affinity[0];
    for (const [category, members] of Object.entries(groupedDevotionConfig)) {
        if (affinity.every(a => members.includes(a))) return category;
    }
    return affinity[0];
}

export function hasConstellationNodeAffix(relic, allAffixData) {
    return (relic.intrinsicAffixes || []).some(entry =>
        allAffixData.find(a => a.id === entry.id)?.type === 'ConstellationNodeAffixDefinition'
    );
}

const formatNumber = (value) => value.toFixed(2).replace(/\.?0+$/, '');

function formatVariableValue(value, format) {
    switch (format) {
        case 'Multiplicative':
            return `${formatNumber((value - 1) * 100)}%[x]`;
        case 'MultiplicativeAdditive':
            return `${formatNumber((value - 1) * 100)}%[+]`;
        case 'Percentage':
            return `${formatNumber(value * 100)}%`;
        case 'Rounded':
            return `${Math.floor(value)}`;
        default:
            return formatNumber(value);
    }
}

function formatModifierValue(value, modifierType, asPercentage) {
    if (modifierType === 'MultiplicativeAdditive') {
        return asPercentage ? `+${formatNumber(Math.abs(value - 1) * 100)}%` : `+${formatNumber(value - 1)}`;
    }
    if (modifierType === 'Multiplicative') {
        return `${formatNumber((value - 1) * 100)}%[x]`;
    }
    const sign = value > 0 ? '+' : '';
    return asPercentage ? `${sign}${formatNumber(value * 100)}%` : `${sign}${formatNumber(value)}`;
}

/**
 * Builds the values for the {n} placeholders of a node affix description at rank 1.
 * @returns {string[]} Replacement texts indexed by placeholder number.
 */
function getPlaceholderValues(affix, allStats) {
    const values = [];
    const modifierType = affix.eModifierType;

    switch (affix.type) {
        case 'SkillBehaviorNodeAffixDefinition': {
            const variables = affix.behaviorData?.variables?.variables || [];
            const rollVariable = variables.find(v => v.name === 'Roll');
            const rollValue = affix.valuePerLevel;
            values[0] = rollVariable
                ? formatVariableValue(rollValue, rollVariable.eSkillEffectVariableFormat)
                : formatModifierValue(rollValue, modifierType, Math.abs(rollValue) < 2).replace(/^\+/, '');
            (affix.additionalLocalizationVariables || []).forEach((locVar, i) => {
                const variable = variables.find(v => v.name === locVar.skillEffectVariableReference?.valueOrName);
                if (variable) {
                    values[i + 1] = formatVariableValue(variable.baseValue, variable.eSkillEffectVariableFormat);
                }
            });
            break;
        }
        case 'StatusMaxStacksNodeAffixDefinition':
            values[0] = formatModifierValue(affix.valuePerLevel, modifierType, false);
            break;
        case 'StatusIntensityNodeAffixDefinition':
            values[0] = formatModifierValue(affix.valuePerLevel, modifierType, true);
            break;
        case 'StatModifierNodeAffixDefinition': {
            const stat = allStats?.find(s => s.name === affix.eStatDefinition);
            values[0] = getEnLoc(stat?.localizedName) || affix.eStatDefinition;
            values[1] = formatModifierValue(affix.value, affix.statModifierType, Math.abs(affix.value) < 2);
            break;
        }
    }
    return values;
}

function formatNodeAffix(affix, allStats) {
    if (affix.hideDescription) return '';
    const description = getEnLoc(affix.description);
    if (!description) return '';

    const values = getPlaceholderValues(affix, allStats);
    return description
        .replace(/<style=.*?>|<\/style>/g, '')
        .replace(/\{(\d+)\}/g, (match, indexStr) => {
            const value = values[parseInt(indexStr, 10)];
            return value === undefined ? '...' : `<code>${value}</code>`;
        })
        .replace(/\n/g, '<br>');
}

function formatNodeDescription(node, allStats) {
    return (node.affixes || [])
        .map(affix => formatNodeAffix(affix, allStats))
        .filter(Boolean)
        .join('<br>');
}

/**
 * Lists the key nodes a constellation-node relic can roll when it drops.
 * @param {object} relic - The relic data object.
 * @param {Array<object>} allAffixData - All affix data.
 * @param {Array<object>} allConstellations - The constellationsDetails list from Constellations.json.
 * @param {object} groupedDevotionConfig - groupedDevotionConfig from Constellations.json.
 * @param {Array<object>} allStats - All stat definitions.
 * @returns {Promise<string>} HTML string, or an empty string if the relic has no constellation node affix.
 */
export async function createConstellationNodesTemplate(relic, allAffixData, allConstellations, groupedDevotionConfig = {}, allStats = null) {
    if (!relic || !hasConstellationNodeAffix(relic, allAffixData)) return '';

    const category = getConstellationCategoryForRelic(relic, groupedDevotionConfig);
    const nodes = [];
    for (const constellation of allConstellations || []) {
        const definition = constellation.definition;
        if (!definition || definition.eDevotionCategory !== category) continue;
        const constellationName = getEnLoc(definition.nameKey) || definition.name;
        for (const node of definition.nodes || []) {
            if (!node.importantNode) continue;
            nodes.push({
                constellationName,
                nodeName: getEnLoc(node.nameLocalizationKey) || node.name,
                description: formatNodeDescription(node, allStats),
            });
        }
    }

    if (nodes.length === 0) {
        return '<p>No key nodes were found for this relic in the constellation data.</p>';
    }

    const effectChance = 100 / nodes.length;
    nodes.sort((a, b) => a.constellationName.localeCompare(b.constellationName) || a.nodeName.localeCompare(b.nodeName));

    const categoryLabel = (relic.devotionAffinity || []).map(c => devotionColorMap[c.toLowerCase()]).filter(Boolean).join(' / ') || 'Neutral';

    let html = `<div class="constellation-nodes">
        <h3>Possible Key Nodes</h3>
        <p>When this relic drops, one key node from the ${categoryLabel} constellations is picked at random, with every node equally likely. The node is forced active while the relic is equipped, even if you haven't unlocked it. The game can exclude nodes that are not available to the player, which the export does not describe.</p>
        <table class="relic-list-table">
            <thead><tr><th>Constellation</th><th>Chance</th><th>Effect</th></tr></thead>
            <tbody>`;
    for (const node of nodes) {
        html += `<tr>
            <td>${node.constellationName}</td>
            <td>${effectChance.toFixed(1)}%</td>
            <td>${node.description}</td>
        </tr>`;
    }
    html += '</tbody></table></div>';
    return html;
}
