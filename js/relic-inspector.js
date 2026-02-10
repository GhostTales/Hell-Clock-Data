import { formatString } from './utils.js';

export class RelicInspector {
    constructor(editor) {
        this.editor = editor;
    }

    renderInspector() {
        const container = document.getElementById('inspectorContent');
        container.innerHTML = '';

        const item = this.editor.getSelectedItem(); 

        if (!item) {
            container.innerHTML = '<p style="color: #666; font-style: italic;">Select a relic to edit details.</p>';
            return;
        }

        const dataManager = this.editor.dataManager;
        const def = dataManager.definitions.relics[item._relicBaseDefinitionID];

        const headerRow = document.createElement('div');
        headerRow.style.marginBottom = '12px';
        
        const nameEl = document.createElement('h3');
        nameEl.style.margin = '0';
        nameEl.style.fontSize = '1.1rem';
        nameEl.style.lineHeight = '1.3';
        nameEl.style.color = 'var(--text-color)';
        nameEl.textContent = dataManager.getRelicName(def, item._tier || 1);
        
        headerRow.appendChild(nameEl);
        container.appendChild(headerRow);

        const statsGrid = document.createElement('div');
        statsGrid.style.display = 'grid';
        statsGrid.style.gridTemplateColumns = 'repeat(3, 1fr)'; 
        statsGrid.style.gap = '20px';
        statsGrid.style.marginBottom = '12px';
        
        const createGridInput = (label, val, min, max, onChange) => {
            const wrap = document.createElement('div');
            const lbl = document.createElement('div');
            lbl.textContent = label;
            lbl.style.fontSize = '0.75em';
            lbl.style.color = 'var(--text-muted)';
            lbl.style.marginBottom = '6px';
            lbl.style.fontWeight = '500';
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.className = 'input-standard'; 
            inp.style.setProperty('width', '100%', 'important'); 
            inp.value = val;
            inp.onchange = (e) => {
                let v = parseInt(e.target.value);
                if (isNaN(v)) v = min;
                v = Math.max(min, Math.min(max, v));
                onChange(v);
            };
            wrap.appendChild(lbl);
            wrap.appendChild(inp);
            return wrap;
        };

        const createSelect = (label, val, options, onChange) => {
            const wrap = document.createElement('div');
            const lbl = document.createElement('div');
            lbl.textContent = label;
            lbl.style.fontSize = '0.75em';
            lbl.style.color = 'var(--text-muted)';
            lbl.style.marginBottom = '6px';
            lbl.style.fontWeight = '500';
            const sel = document.createElement('select');
            sel.style.cssText = `width: 100%; background-color: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color); padding: 4px 8px; border-radius: 4px; height: 28px; font-size: 0.9rem;`;
            options.forEach(opt => {
                const el = document.createElement('option');
                el.value = opt.value;
                el.text = opt.text;
                if (opt.value === val) el.selected = true;
                sel.appendChild(el);
            });
            sel.onchange = (e) => onChange(parseInt(e.target.value));
            wrap.appendChild(lbl);
            wrap.appendChild(sel);
            return wrap;
        };

        statsGrid.appendChild(createGridInput('Level', item._upgradeLevel, 0, 10, (v) => {
            item._upgradeLevel = v;
            this.renderInspector();
        }));

        const currentTier = item._tier || 1; 
        statsGrid.appendChild(createGridInput('Tier', currentTier, 1, 4, (v) => {
            item._tier = v;
            if (item._affixesData) item._affixesData.forEach(a => a._tier = v);
            if (item._implicitAffixesData) item._implicitAffixesData.forEach(i => {
                if (i._relicAffixData) i._relicAffixData._tier = v;
            });
            this.renderInspector();
            this.editor.renderer.renderGrid();
            this.editor.renderer.renderStash();
        }));

        let rarityOpts = [];
        if (dataManager.data.config && dataManager.data.config.relicRarityConfigs) {
            rarityOpts = dataManager.data.config.relicRarityConfigs.map((cfg, index) => {
                const enName = cfg.rarityNameKey.find(k => k.langCode === 'en');
                return { value: index, text: enName ? enName.langTranslation : cfg.eRelicRarity };
            });
        } else {
            rarityOpts = [
                { value: 0, text: 'Common' }, { value: 1, text: 'Magic' },
                { value: 2, text: 'Rare' }, { value: 3, text: 'Unique' }
            ];
        }

        statsGrid.appendChild(createSelect('Rarity', item._eRelicRarity, rarityOpts, (v) => {
            item._eRelicRarity = v;
            this.editor.renderer.renderGrid(); 
        }));

        container.appendChild(statsGrid);

        const hasHighRolls = (item._affixesData && item._affixesData.some(a => a._rollValue > 1.0)) || 
                             (item._implicitAffixesData && item._implicitAffixesData.some(i => i._relicAffixData._rollValue > 1.0));
        const isUnlocked = this.editor.ui_unlockLimits || hasHighRolls;

        const unlockDiv = document.createElement('div');
        unlockDiv.style.marginBottom = '16px';
        unlockDiv.style.borderBottom = '1px solid var(--border-color)'; 
        unlockDiv.style.paddingBottom = '12px';

        const unlockLabel = document.createElement('label');
        unlockLabel.style.fontSize = '0.8em';
        unlockLabel.style.color = 'var(--text-muted)';
        unlockLabel.style.display = 'flex';
        unlockLabel.style.alignItems = 'center';
        unlockLabel.style.gap = '8px';
        unlockLabel.style.cursor = 'pointer';
        
        unlockLabel.innerHTML = `<input type="checkbox" ${isUnlocked ? 'checked' : ''}> Unlock Limits (Divined)`;
        unlockLabel.querySelector('input').onchange = (e) => this.editor.toggleLimitUnlock(e.target.checked);
        
        unlockDiv.appendChild(unlockLabel);
        container.appendChild(unlockDiv);

        const currentLevel = item._upgradeLevel;
        if (!item._affixesData) item._affixesData = [];
        if (!item._implicitAffixesData) item._implicitAffixesData = [];

        const primaryPool = dataManager.getAllowedAffixIds(item._relicBaseDefinitionID, 'primary');
        const uniqueList = [];
        const primaryList = [];
        const secondaryList = [];

        item._affixesData.forEach((affix, index) => {
            const aDef = dataManager.definitions.affixes[affix._relicAffixDefinitionId];
            const isUnique = aDef && (aDef.eAffixRarity === 'Unique' || aDef.eAffixRarity === 'Special');
            const entry = { affix: affix, index: index };
            if (isUnique) uniqueList.push(entry);
            else if (primaryPool.includes(affix._relicAffixDefinitionId)) primaryList.push(entry);
            else secondaryList.push(entry);
        });

        const isPriFull = dataManager.hasReachedAffixLimit(item, 'primary');
        const isSecFull = dataManager.hasReachedAffixLimit(item, 'secondary');
        const isUniqueOrRareFull = uniqueList.length > 0;

        const btnRare = [{
            label: '+ Add Rare',
            disabled: isUniqueOrRareFull, 
            onClick: () => {
                this.editor.modals.activeAffixType = 'rare'; 
                this.editor.modals.openAffixModal(null, (id) => this.editor.addSpecificAffix(id));
            }
        }];

        this.renderUnifiedAffixList(container, uniqueList, {
            title: "Unique & Rare",
            type: 'none',
            tier: currentTier,
            level: currentLevel,
            isUnlocked,
            buttons: btnRare,   
            allowLock: false,   
            allowRemove: true   
        });

        const implicitCount = item._implicitAffixesData ? item._implicitAffixesData.length : 0;
        const isImplicitFull = this.editor.restrictAffixes && implicitCount >= 2;

        const btnImplicit = [{
            label: '+ Add Implicit',
            disabled: isImplicitFull,
            onClick: () => {
                this.editor.modals.activeAffixType = 'implicit'; 
                this.editor.modals.openAffixModal(null, (id) => {
                    this.editor.addAffix(true, id);
                });
            }
        }];
        
        this.renderUnifiedAffixList(container, item._implicitAffixesData, {
            title: "Implicit Affixes",
            type: 'implicit',
            tier: currentTier,
            level: currentLevel,
            isUnlocked,
            buttons: btnImplicit,
            allowLock: false,
            allowRemove: true
        });

        const maxPrimary = def.primaryAffixAmount ? def.primaryAffixAmount[1] : 0;
        if (!this.editor.restrictAffixes || maxPrimary > 0 || primaryList.length > 0) {
            const btnPrimary = [{
                label: '+ Add Primary',
                disabled: isPriFull,
                onClick: () => {
                    this.editor.modals.activeAffixType = 'primary';
                    this.editor.modals.openAffixModal(null, (id) => this.editor.addSpecificAffix(id));
                }
            }];
            this.renderUnifiedAffixList(container, primaryList, {
                title: "Primary Affixes",
                type: 'primary',
                tier: currentTier,
                level: currentLevel,
                isUnlocked,
                buttons: btnPrimary,
                allowLock: true,   
                allowRemove: true  
            });
        }

        const btnSecondary = [{
            label: '+ Add Secondary',
            disabled: isSecFull,
            onClick: () => {
                this.editor.modals.activeAffixType = 'secondary';
                this.editor.modals.openAffixModal(null, (id) => this.editor.addSpecificAffix(id));
            }
        }];
        this.renderUnifiedAffixList(container, secondaryList, {
            title: "Secondary Affixes",
            type: 'secondary',
            tier: currentTier,
            level: currentLevel,
            isUnlocked,
            buttons: btnSecondary,
            allowLock: true,   
            allowRemove: true  
        });
    }

    renderUnifiedAffixList(container, items, config) {
        const { title, type, tier, level, isUnlocked, buttons, allowLock, allowRemove } = config;
        const isImplicit = type === 'implicit';
        const dataManager = this.editor.dataManager;

        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-top:20px; margin-bottom:10px; border-bottom:1px solid var(--border-color); padding-bottom:6px;';

        const h4 = document.createElement('h4');
        h4.textContent = title;
        h4.style.cssText = 'border:none; margin:0; font-size:0.9rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;';
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display:flex; gap:5px;';

        if (buttons) {
            buttons.forEach(btnConfig => {
                const btn = document.createElement('button');
                btn.className = 'btn-add';
                btn.style.cssText = 'width:auto; padding:4px 10px; font-size:0.8em; margin-top:0;';
                btn.textContent = btnConfig.label;
                btn.onclick = btnConfig.onClick;
                
                if (btnConfig.disabled) {
                    btn.disabled = true;
                    btn.title = "Limit Reached";
                    btn.style.opacity = "0.5";
                    btn.style.cursor = "not-allowed";
                }
                buttonContainer.appendChild(btn);
            });
        }
        
        headerRow.appendChild(h4);
        headerRow.appendChild(buttonContainer);
        container.appendChild(headerRow);

        const list = document.createElement('div');
        list.className = 'affix-list';

        items.forEach((itemWrapper, loopIndex) => {
            let affixData, originalIndex;
            const catColors = { 0: '#e5534b', 1: '#58a6ff', 2: '#3fb950', 3: '#a371f7', [-1]: '#888888' };

            if (isImplicit) {
                if (loopIndex === 3) {
                    const limitWarning = document.createElement('div');
                    limitWarning.style.cssText = 'color:#d29922; text-align:center; font-size:0.75em; padding:8px;';
                    limitWarning.textContent = '--- GAME DISPLAY LIMIT (TOP 3 SHOWN) ---';
                    list.appendChild(limitWarning);
                }
                affixData = itemWrapper._relicAffixData;
                originalIndex = loopIndex;
            } else {
                affixData = itemWrapper.affix;
                originalIndex = itemWrapper.index;
            }

            const defId = affixData._relicAffixDefinitionId;
            const def = dataManager.definitions.affixes[defId];
            const range = dataManager.getAffixRange(defId, tier);

            const div = document.createElement('div');
            div.className = 'affix-item';
            
            let typeLabelContainer = null;
            
            if (isImplicit) {
                if (loopIndex >= 3) div.style.opacity = '0.6';
                const cats = dataManager.getAffixCategory(defId);
                const colors = cats.map(c => catColors[c] || catColors[-1]);
                
                if (colors.length > 1) {
                    const step = 100 / colors.length;
                    const blendBuffer = 6; 
                    let stops = [];
                    colors.forEach((col, i) => {
                        const segmentStart = i * step;
                        const segmentEnd = (i + 1) * step;
                        if (i === 0) {
                            stops.push(`${col} 0%`);
                            stops.push(`${col} ${segmentEnd - blendBuffer}%`);
                        } else if (i === colors.length - 1) {
                            stops.push(`${col} ${segmentStart + blendBuffer}%`);
                            stops.push(`${col} 100%`);
                        } else {
                            stops.push(`${col} ${segmentStart + blendBuffer}%`);
                            stops.push(`${col} ${segmentEnd - blendBuffer}%`);
                        }
                    });
                    div.style.borderLeft = '3px solid transparent';
                    div.style.background = `linear-gradient(to bottom, ${stops.join(', ')}) no-repeat border-box left/3px 100%, var(--bg-color)`;
                } else if (colors.length === 1) {
                    div.style.borderLeft = `3px solid ${colors[0]}`;
                } else {
                    div.style.borderLeft = `3px solid ${catColors[-1]}`;
                }

                typeLabelContainer = document.createElement('div');
                typeLabelContainer.style.cssText = 'font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom: 2px; line-height: 1;';
                
                if (cats.length > 0) {
                    cats.forEach((c, i) => {
                        const span = document.createElement('span');
                        span.textContent = dataManager.getImplicitCategoryName(c);
                        span.style.color = catColors[c] || catColors[-1];
                        typeLabelContainer.appendChild(span);
                        if (i < cats.length - 1) {
                            const divider = document.createElement('span');
                            divider.textContent = ' / ';
                            divider.style.color = 'var(--text-muted)';
                            typeLabelContainer.appendChild(divider);
                        }
                    });
                } else {
                    const span = document.createElement('span');
                    span.textContent = "UNKNOWN";
                    span.style.color = catColors[-1];
                    typeLabelContainer.appendChild(span);
                }
            }

            const header = document.createElement('div');
            header.className = 'affix-header';

            const nameGroup = document.createElement('div');
            nameGroup.className = 'affix-name-group';

            if (isImplicit && typeLabelContainer) {
                nameGroup.appendChild(typeLabelContainer);
            }

            const nameBtn = document.createElement('button');
            nameBtn.className = 'affix-name-btn';
            nameBtn.textContent = def ? formatString(def.name) : `ID: ${defId}`;
            
            const isStrictlyUnique = def && def.eAffixRarity === 'Unique';
            const isRare = def && def.eAffixRarity === 'Special';

            if (isStrictlyUnique) {
                nameBtn.disabled = true;
                nameBtn.style.cursor = 'default';
                nameBtn.title = "Unique affixes cannot be changed";
            } else {
                nameBtn.title = "Click to change affix";
                nameBtn.onclick = () => {
                    let contextType = type;
                    if (isRare) contextType = 'rare';
                    this.editor.modals.activeAffixType = contextType; 
                    this.editor.modals.openAffixModal(defId, (newId) => {
                        const parsedId = parseInt(newId);
                        affixData._relicAffixDefinitionId = parsedId;
                        if (isImplicit) itemWrapper._eImplicitAffixCategory = null; 
                        this.renderInspector();
                    });
                };
            }
            nameGroup.appendChild(nameBtn);

            const metaRow = document.createElement('div');
            metaRow.className = 'affix-meta-row';

            if (range) {
                const rangeInfo = document.createElement('span');
                rangeInfo.className = 'range-info-card';
                rangeInfo.textContent = `[${range[0]} - ${range[1]}]`;
                metaRow.appendChild(rangeInfo);
            }

            const tagsDiv = document.createElement('div');
            tagsDiv.className = 'affix-tags';

            const overrideConfig = dataManager.getAdditiveOverrideConfig(def);
            if (overrideConfig) {
                const val = parseFloat(overrideConfig[level] || 0);
                if (val !== 0) {
                    const displayVal = val >= 0 ? `+${val}` : val;
                    tagsDiv.innerHTML += `<span class="tag-mini" style="color:#79c0ff; border-color:rgba(121, 192, 255, 0.4);">${displayVal}</span>`;
                }
            } else {
                const mult = dataManager.getUpgradeMultiplier(level, def);
                if (mult > 1.0) tagsDiv.innerHTML += `<span class="tag-mini" style="color:#79c0ff; border-color:rgba(121, 192, 255, 0.4);">x${mult}</span>`;
            }

            if (!isImplicit && def) {
                if (def.eAffixRarity === 'Unique') tagsDiv.innerHTML += `<span class="tag-mini" style="color:#f85149; border-color:#f85149;">Unique</span>`;
                else if (def.eAffixRarity === 'Special') tagsDiv.innerHTML += `<span class="tag-mini" style="color:#d29922; border-color:#d29922;">Rare</span>`;
            }

            metaRow.appendChild(tagsDiv);
            nameGroup.appendChild(metaRow);

            const rightGroup = document.createElement('div');
            rightGroup.className = 'affix-right-group';

            const calcVal = document.createElement('span');
            calcVal.className = 'calculated-value-card';
            calcVal.textContent = dataManager.calculateRealValue(affixData._rollValue, range, level, def);
            rightGroup.appendChild(calcVal);

            if (allowLock) {
                const lockLabel = document.createElement('label');
                lockLabel.className = 'lock-label';
                lockLabel.innerHTML = `<input type="checkbox" ${affixData._locked ? 'checked' : ''}> Lock`;
                lockLabel.querySelector('input').onchange = (e) => this.editor.updateAffixLock(originalIndex, e.target.checked, false);
                rightGroup.appendChild(lockLabel);
            }

            header.appendChild(nameGroup);
            header.appendChild(rightGroup);
            div.appendChild(header);

            const controls = document.createElement('div');
            controls.className = 'affix-controls';

            const maxVal = Math.max(1.0, affixData._rollValue, isUnlocked ? 1.2 : 1.0);
            
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = 0;
            slider.max = maxVal;
            slider.step = 0.001;
            slider.value = affixData._rollValue;
            setTimeout(() => this.editor.renderer.updateSliderFill(slider), 0);

            const numInput = document.createElement('input');
            numInput.type = 'number';
            numInput.className = 'input-standard';
            numInput.step = 0.001;
            numInput.value = affixData._rollValue.toFixed(3);

            const updateVal = (val, source) => {
                let v = parseFloat(val);
                if (source === 'input' && v > maxVal) v = maxVal;
                affixData._rollValue = v;
                if (source === 'slider') numInput.value = v.toFixed(3);
                else { slider.value = v; this.editor.renderer.updateSliderFill(slider); }
                if (range) calcVal.textContent = dataManager.calculateRealValue(v, range, level, def);
            };

            slider.oninput = (e) => { updateVal(e.target.value, 'slider'); this.editor.renderer.updateSliderFill(e.target); };
            numInput.onchange = (e) => updateVal(e.target.value, 'input');

            controls.appendChild(slider);
            controls.appendChild(numInput);

            if (allowRemove && !isStrictlyUnique) {
                const btnRemove = document.createElement('button');
                btnRemove.className = 'btn-remove-danger';
                btnRemove.textContent = 'Remove';
                btnRemove.onclick = () => this.editor.removeAffix(originalIndex, isImplicit);
                controls.appendChild(btnRemove);
            }

            div.appendChild(controls);
            list.appendChild(div);
        });
        
        container.appendChild(list);
    }
}
