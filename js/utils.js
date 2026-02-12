// c:\MasterFolder\Programming\Hell-Clock-Data\js\utils.js
export function secureReviver(key, value) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
        return undefined;
    }
    return value;
}

export function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

export function formatString(str) {
    if (!str) return '';
    return str
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
}

export function getEnglishTranslation(localizedArray) {
    if (!localizedArray || !Array.isArray(localizedArray)) return null;
    const en = localizedArray.find(k => k.langCode === 'en');
    return en ? en.langTranslation : null;
}

export function getRawDescription(def) {
    if (!def || !def.description) return null;
    if (Array.isArray(def.description)) {
        const enObj = def.description.find(d => d.langCode === 'en') || def.description[0];
        return enObj ? enObj.langTranslation : null;
    } else if (typeof def.description === 'string') {
        return def.description;
    }
    return null;
}

export function formatAffixDescription(def, dataManager, finalValStr, affixName) {
    let descText = getRawDescription(def);

    if (!descText) return null;

    descText = descText.replace(/<style="[^"]+">/g, '').replace(/<\/style>/g, '');
    descText = descText.replace(/<color=(#[a-fA-F0-9]+)>(.*?)<\/color>/g, '<span style="color:$1">$2</span>');

    descText = descText.replace(/{(\d+)}/g, (match, indexStr) => {
        const i = parseInt(indexStr);
        
        if (def.type === 'StatModifierAffixDefinition' || def.type === 'SkillLevelAffixDefinition') {
            if (i === 0) return affixName;
            if (i === 1) return `<strong>${finalValStr}</strong>`;
            if (i === 2) {
                if (def.type === 'SkillLevelAffixDefinition') {
                    return `<strong>${dataManager.getMaxSkillUpgradeLevelBonus()}</strong>`;
                } else if (def.additionalStatModifierDefinitions && def.additionalStatModifierDefinitions.length > 0) {
                    return ` / ${dataManager.formatStatName(def.additionalStatModifierDefinitions[0].eStatDefinition)}`;
                }
            }
            return ""; 
        } else if (def.type === 'RegenOnKillAffixDefinition' || def.type === 'StatusMaxStacksAffixDefinition') {
            if (i === 0) return `<strong>${finalValStr}</strong>`;
            if (i === 1) return affixName;
            return "";
        } else {
            // {0} is always the main value (Roll)
            if (i === 0) return `<strong>${finalValStr}</strong>`;
            
            // Handle {1}, {2}, etc. via additionalLocalizationVariables mapping
            if (def.additionalLocalizationVariables && def.additionalLocalizationVariables[i - 1]) {
                const locVar = def.additionalLocalizationVariables[i - 1];
                const targetName = locVar.skillEffectVariableReference?.name;
                
                let varsList = [];
                if (def.behaviorData?.variables?.variables) varsList = def.behaviorData.variables.variables;
                else if (def.variables?.variables) varsList = def.variables.variables;

                const targetVar = varsList.find(v => v.name === targetName);
                if (targetVar && targetVar.baseValue !== undefined) {
                    let val = targetVar.baseValue;
                    const format = locVar.valueFormatOverride || targetVar.eSkillEffectVariableFormat;
                    
                    return `<strong>${calculateValue(format, val)}</strong>`;
                }
            }

            // Fallback: Try to find variable by index if not found in additional map
            let varsList = [];
            if (def.behaviorData?.variables?.variables) varsList = def.behaviorData.variables.variables;
            else if (def.variables?.variables) varsList = def.variables.variables;

            let v = varsList[i];
            if (!v && i > 0) v = varsList[i-1];

            if (v) {
                if (v.name === "Roll") return `<strong>${finalValStr}</strong>`;
                if (typeof v === 'object' && v.baseValue !== undefined) {
                    let val = v.baseValue;
                    let format = v.eSkillEffectVariableFormat;
                    
                    return `<strong>${calculateValue(format, val)}</strong>`;
                }
            }
            if (i === 1) return `<strong>${finalValStr}</strong>`;
            return match; 
        }
    });

    return descText.replace(/\n/g, '<br>');
}

export function calculateValue(format, val) {
        if (format === 'Percentage') val = Math.round(val * 100) + '%';
        else if (format === 'Rounded') val = Math.round(val);
        else if (format === 'Multiplicative') val = Math.round((val - 1) * 100) + '%[x]';
        return val;
    }