// c:\MasterFolder\Programming\Hell-Clock-Data\js\tooltip-manager.js
import { formatString } from './utils.js';

export class TooltipManager {
    constructor(editor) {
        this.editor = editor;
        this.tooltipEl = document.getElementById('relicTooltip');
    }

    showTooltip(e, item) {
        if (this.editor.dragManager && this.editor.dragManager.isDragging) return;
        if (!this.tooltipEl) this.tooltipEl = document.getElementById('relicTooltip');
        
        const def = this.editor.dataManager.definitions.relics[item._relicBaseDefinitionID];
        const tier = item._tier || 1;
        const level = item._upgradeLevel || 0;

        let html = `<div class="tooltip-header">${this.editor.renderer.formatRelicDisplay(this.editor.dataManager.getRelicName(def, tier))}</div>`;

        const topList = [];
        const normalImplicits = [];
        const normalExplicits = [];

        const categorize = (affixList, isImplicit) => {
            if (!affixList) return;
            affixList.forEach(wrapper => {
                const data = isImplicit ? wrapper._relicAffixData : wrapper;
                const defId = data._relicAffixDefinitionId;
                const affixDef = this.editor.dataManager.definitions.affixes[defId];
                const isRareOrUnique = affixDef && (affixDef.eAffixRarity === 'Unique' || affixDef.eAffixRarity === 'Special');

                if (isRareOrUnique) {
                    topList.push({ data, isImplicit });
                } else if (isImplicit) {
                    normalImplicits.push({ data, isImplicit });
                } else {
                    normalExplicits.push({ data, isImplicit });
                }
            });
        };

        categorize(item._implicitAffixesData, true);
        categorize(item._affixesData, false);

        if (topList.length > 0) {
            html += `<div class="tooltip-section">`;
            topList.forEach(item => html += this.generateAffixTooltipRow(item.data, level, tier, item.isImplicit));
            html += `</div>`;
        }

        if (topList.length > 0 && (normalImplicits.length > 0 || normalExplicits.length > 0)) {
            html += `<div class="tooltip-divider"></div>`;
        }

        if (normalImplicits.length > 0) {
            html += `<div class="tooltip-section">`;
            normalImplicits.forEach(item => html += this.generateAffixTooltipRow(item.data, level, tier, true));
            html += `</div>`;
        }

        if (normalImplicits.length > 0 && normalExplicits.length > 0) {
            html += `<div class="tooltip-divider"></div>`;
        }

        if (normalExplicits.length > 0) {
            html += `<div class="tooltip-section">`;
            normalExplicits.forEach(item => html += this.generateAffixTooltipRow(item.data, level, tier, false));
            html += `</div>`;
        }

        this.tooltipEl.innerHTML = html;
        this.tooltipEl.style.display = 'block';
        this.moveTooltip(e);
    }

    moveTooltip(e) {
        if (!this.tooltipEl) return;
        
        const offset = 15;
        const x = e.clientX + offset;
        let y = e.clientY + offset;

        const tooltipRect = this.tooltipEl.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        if (e.clientY + tooltipRect.height + offset > viewportHeight) {
            y = e.clientY - tooltipRect.height - offset;
        }

        let finalX = x;
        if (x + tooltipRect.width > viewportWidth) {
            finalX = viewportWidth - tooltipRect.width - offset;
        }

        this.tooltipEl.style.left = `${finalX}px`;
        this.tooltipEl.style.top = `${y}px`;
    }

    hideTooltip() {
        if (this.tooltipEl) {
            this.tooltipEl.style.display = 'none';
        }
    }

    generateAffixTooltipRow(affixData, level, tier, isImplicit) {
        const defId = affixData._relicAffixDefinitionId;
        const def = this.editor.dataManager.definitions.affixes[defId];
        if (!def) return '';

        const name = def ? formatString(def.name) : `ID: ${defId}`;
        const range = this.editor.dataManager.getAffixRange(defId, tier);
        const finalValStr = this.editor.dataManager.calculateRealValue(affixData._rollValue, range, level, def);
        
        let rangeStr = "";
        if (range) {
            let minVal = this.editor.dataManager.calculateRealValue(0, range, level, def);
            let maxVal = this.editor.dataManager.calculateRealValue(1, range, level, def);
            minVal = minVal.replace(/[^0-9.-]/g, '');
            maxVal = maxVal.replace(/[^0-9.-]/g, '');
            rangeStr = `<span class="tooltip-range">[${minVal} - ${maxVal}]</span>`;
        }

        let iconName = 'UI_AffixBullet.png'; 
        let colorHex = null;
        
        const isRareOrUnique = def.eAffixRarity === 'Unique' || def.eAffixRarity === 'Special';
        const imgClass = isRareOrUnique ? "tooltip-icon large" : "tooltip-icon";
        const cats = this.editor.dataManager.getAffixCategory(defId);

        if (affixData._locked) {
            iconName = 'UI_AffixBullet-Locked.png';
        } else if (isRareOrUnique && def.customIcon) {
            iconName = def.customIcon.endsWith('.png') ? def.customIcon : `${def.customIcon}.png`;
        } else if (isRareOrUnique && def.name && def.name.includes(' - ')) {
             let skillName = def.name.split(' - ')[0].replace(/^The\s+/i, '').replace(/[^a-zA-Z0-9]/g, '');
             if (skillName === 'VeilofQuills') skillName = 'HomingProjectiles';
             if (skillName === 'Matadeira') skillName = 'EnemyCannons';
             if (skillName === 'Bombardment') skillName = 'RainOfHeads';
             if (skillName === 'SummonMarksmen') skillName = 'PhantomMarksmen';
             iconName = `IconSkill_${skillName}.png`;
        } else if (cats.includes(3)) {
            iconName = 'UI_CorruptedBullet.png';
            colorHex = '#a371f7';
        } else if (isImplicit && cats.some(c => c >= 0 && c <= 2)) {
            iconName = 'UI_AffixBullet3.png';
            if (cats.includes(0)) colorHex = '#e5534b';
            else if (cats.includes(1)) colorHex = '#58a6ff';
            else if (cats.includes(2)) colorHex = '#3fb950';
        }

        const iconPath = `icons/${iconName}`;
        let iconHtml = colorHex 
            ? `<div class="${imgClass} colored" style="background-color: ${colorHex}; -webkit-mask-image: url('${iconPath}'); mask-image: url('${iconPath}');"></div>`
            : `<img src="${iconPath}" class="${imgClass}" onerror="this.style.display='none'">`;

        let contentHtml = '';
        let descText = null;

        if (def.description) {
            if (Array.isArray(def.description)) {
                const enObj = def.description.find(d => d.langCode === 'en') || def.description[0];
                if (enObj) descText = enObj.langTranslation;
            } else if (typeof def.description === 'string') {
                descText = def.description;
            }
        }

        if (descText) {
            descText = descText.replace(/<style="[^"]+">/g, '').replace(/<\/style>/g, '');
            descText = descText.replace(/<color=(#[a-fA-F0-9]+)>(.*?)<\/color>/g, '<span style="color:$1">$2</span>');

            const affixName = this.editor.dataManager.getAffixName(defId);

            descText = descText.replace(/{(\d+)}/g, (match, indexStr) => {
                const i = parseInt(indexStr);
                
                if (def.type === 'StatModifierAffixDefinition' || def.type === 'SkillLevelAffixDefinition') {
                    if (i === 0) return affixName;
                    if (i === 1) return `<strong>${finalValStr}</strong>`;
                    if (i === 2) {
                        if (def.type === 'SkillLevelAffixDefinition') {
                            return `<strong>${this.editor.dataManager.getMaxSkillUpgradeLevelBonus()}</strong>`;
                        } else if (def.additionalStatModifierDefinitions && def.additionalStatModifierDefinitions.length > 0) {
                            return ` / ${this.editor.dataManager.formatStatName(def.additionalStatModifierDefinitions[0].eStatDefinition)}`;
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
                            
                            if (format === 'Percentage') val = Math.round(val * 100) + '%';
                            else if (format === 'Rounded') val = Math.round(val);
                            else if (format === 'Multiplicative') val = Math.round((val - 1) * 100) + '%[x]';
                            
                            return `<strong>${val}</strong>`;
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
                            if (v.eSkillEffectVariableFormat === 'Percentage') val = Math.round(val * 100) + '%';
                            else if (v.eSkillEffectVariableFormat === 'Rounded') val = Math.round(val);
                            else if (v.eSkillEffectVariableFormat === 'Multiplicative') val = Math.round((val-1)*100) + '%[x]';
                            return `<strong>${val}</strong>`;
                        }
                    }
                    if (i === 1) return `<strong>${finalValStr}</strong>`;
                    return match; 
                }
            });

            descText = descText.replace(/\n/g, '<br>');

            contentHtml = `
                <div class="tooltip-text column-mode">
                    <span class="tooltip-desc">${descText}</span>
                    ${rangeStr}
                </div>`;
        } else {
            const nameStr = def ? formatString(def.name) : `ID: ${defId}`;
            contentHtml = `
                <div class="tooltip-text">
                    <span class="tooltip-val"><strong>${finalValStr}</strong> ${nameStr}</span>
                    ${rangeStr}
                </div>`;
        }

        return `<div class="tooltip-row">${iconHtml}${contentHtml}</div>`;
    }
}
