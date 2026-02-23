// c:\MasterFolder\Programming\Hell-Clock-Data\js\tooltip-manager.js
import { formatString, formatAffixDescription } from './utils.js';

export class TooltipManager {
    constructor(editor) {
        this.editor = editor;
        this.tooltipEl = document.getElementById('relicTooltip');
    }

    generateTooltipHTML(item) {
        const def = this.editor.dataManager.definitions.relics[item._relicBaseDefinitionID];
        if (!def) return "Unknown Item";

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

        return html;
    }

    showTooltip(e, item) {
        if (this.editor.dragManager && this.editor.dragManager.isDragging) return;
        if (!this.tooltipEl) this.tooltipEl = document.getElementById('relicTooltip');
        
        this.tooltipEl.innerHTML = this.generateTooltipHTML(item);
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
             const skillNameMap = {
                 'VeilofQuills': 'HomingProjectiles',
                 'Matadeira': 'EnemyCannons',
                 'Bombardment': 'RainOfHeads',
                 'SummonMarksmen': 'PhantomMarksmen',
                 'Splitshot': 'SplitShot'
             };
             if (skillNameMap[skillName]) skillName = skillNameMap[skillName];
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
        const affixName = this.editor.dataManager.getAffixName(defId);
        let descText = formatAffixDescription(def, this.editor.dataManager, finalValStr, affixName);

        if (descText) {
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
