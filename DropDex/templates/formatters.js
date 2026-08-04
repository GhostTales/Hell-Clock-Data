import { getEnLoc } from './utils.js';

/**
 * Formats a numeric value from an affix roll range based on its definition.
 * @param {number} val The numeric value to format.
 * @param {object} affixDef The full affix definition object.
 * @param {object|null} varDef The variable definition, if applicable (for SkillBehaviorAffix).
 * @returns {string} The formatted value as a string.
 */
function formatValue(val, affixDef, varDef) {
	const modifierType = affixDef.statModifierType;
	const formatType = varDef?.eSkillEffectVariableFormat;

	// Handle Multiplicative types first
	if (modifierType === 'MultiplicativeAdditive' || formatType === 'MultiplicativeAdditive') {
		const displayVal = (val - 1) * 100;
		return `${displayVal.toFixed(0)}%[+]`;
	}
	if (modifierType === 'Multiplicative' || formatType === 'Multiplicative') {
		const displayVal = (val - 1) * 100;
		return `${displayVal.toFixed(0)}%[x]`;
	}

	// Handle Percentage
	const isPercent = formatType === 'Percentage' ||
		(affixDef.type === 'RegenOnKillAffixDefinition' && !affixDef.flatRegen) ||
		(affixDef.type === 'StatModifierAffixDefinition' && Math.abs(val) < 2 && val !== 0);

	if (isPercent) {
		const displayVal = val * 100;
		const toFixed = (displayVal % 1 !== 0) ? 2 : 0;
		const prefix = (modifierType === 'Additive' && val > 0) ? '+' : '';
		return `${prefix}${displayVal.toFixed(toFixed)}%`;
	}

	// Handle flat values
	const displayVal = val.toFixed(2).replace(/\.00$/, '');
	const prefix = (modifierType === 'Additive' && val > 0) ? '+' : '';
	return `${prefix}${displayVal}`;
}

/**
 * Processes and formats an affix description, filling in roll ranges and other variables.
 * @param {object} affixDef The affix definition object.
 * @returns {string} The formatted affix description.
 */
export function formatAffixDescription(affixDef) {
    if (!affixDef) return 'Affix definition not found.';

    let desc = getEnLoc(affixDef.description) || 'No description available.';

    desc = desc.replace(/<style=.*?>|<\/style>/g, '');

    return desc.replace(/\{(\d+)\}/g, (match, indexStr) => {
        const index = parseInt(indexStr, 10);
        
        if (index === 0) { // Handle rollable value, which is always {0}
            if (affixDef.tierRollRanges) {
                const tier4RollRange = affixDef.tierRollRanges.find(r => r.tier === 4);
                if (tier4RollRange) {
                    let [min, max] = tier4RollRange.rollRange;
                    if (min > max) [min, max] = [max, min];

                    const varName = affixDef.rollVariableName;
                    const varDef = varName ? affixDef.behaviorData?.variables?.variables.find(v => v.name === varName) : null;

                    const prefix = affixDef.descriptionValuePrefix || '';
                    const formattedMin = formatValue(min, affixDef, varDef);
                    const formattedMax = formatValue(max, affixDef, varDef);

                    return `<code>${prefix}${formattedMin} - ${prefix}${formattedMax}</code>`;
                }
            }
        } else { // Handle static placeholders from additionalLocalizationVariables
            const locVar = affixDef.additionalLocalizationVariables?.[index - 1];
            const varName = locVar?.skillEffectVariableReference?.valueOrName;
            if (!varName) {
                return '...';
            }
            const varDef = affixDef.behaviorData?.variables?.variables.find(v => v.name === varName);
            if (varDef) {
                return `<code>${formatValue(varDef.baseValue, affixDef, varDef)}</code>`;
            }
        }

        return '...';
    });
}