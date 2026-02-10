// c:\MasterFolder\Programming\Hell-Clock-Data\js\relic-editor.js
import { secureReviver, getLevenshteinDistance, formatString } from './utils.js';
import { TooltipManager } from './tooltip-manager.js';
import { DragManager } from './drag-manager.js';

class RelicEditor {
    constructor() {
        this.data = {
            save: null,
            relics: null,
            affixes: null,
            config: null
        };
        
        this.definitions = {
            relics: {}, 
            affixes: {},
            defaultUpgradeModifiers: null, 
            fallbackUpgradeModifiers: {
                "0": 1.0, "1": 1.2, "2": 1.4, "3": 1.6, "4": 1.8,
                "5": 2.0, "6": 2.2, "7": 2.4, "8": 2.6, "9": 2.8, "10": 3.0
            },
            sizes: {
                "Small":   {w: 1, h: 1},
                "Large":   {w: 1, h: 2}, 
                "Grand":   {w: 1, h: 4},
                "Exalted": {w: 2, h: 2},
                "Default": {w: 1, h: 1}
            }
        };

        this.resolvedImageCache = new Map();
        this.stashItems = []; 
        this.stashWidth = 6;  
        this.stashHeight = 50; 
        this.stashCellSize = 60;

        this.currentLoadoutIndex = 0;
        this.selectedRelicIndex = -1;
        
        this.tooltipManager = new TooltipManager(this);
        this.dragManager = new DragManager(this);

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                e.preventDefault();
                this.dragManager.undoLastDelete();
            }
        });

        this.initAutoLoad();
    }

    async initAutoLoad() {
        const files = [
            { key: 'relics', path: 'json_data/relic_data/Relics.json' },
            { key: 'affixes', path: 'json_data/relic_data/Relic Affixes.json' },
            { key: 'config', path: 'json_data/relic_data/Relic Inventory Config.json' },
            { key: 'implicit_mapping', path: 'json_data/relic_data/implicit_mapping.json' }
        ];

        try {
            const promises = files.map(file => 
                fetch(file.path)
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        return response.json();
                    })
                    .then(data => {
                        this.data[file.key] = data;
                    })
            );

            await Promise.all(promises);
            this.processDefinitions();
            this.enableSaveUpload();

            const cellSizeSlider = document.querySelector('input[type="range"][min="65"]');
            if (cellSizeSlider) {
                this.updateGridSettings(cellSizeSlider.value); 
                this.updateSliderFill(cellSizeSlider);
            }

            const restrictCheckbox = document.getElementById('chk-restrict');
            if (restrictCheckbox) this.restrictAffixes = restrictCheckbox.checked; 

            const searchRestrictCheckbox = document.getElementById('chk-search-restrict');
            if (searchRestrictCheckbox) this.restrictSearch = searchRestrictCheckbox.checked;
            
        } catch (error) {
            console.error(error);
            alert("Error loading data files. Please check the 'relic_data' folder exists.");
        }
    }

    enableSaveUpload() {
        const input = document.getElementById('inp-save');
        const lbl = document.getElementById('lbl-save');
        if(input && lbl) {
            input.disabled = false;
            lbl.classList.remove('disabled');
        }
    }

    processDefinitions() {
        if (this.data.relics && this.data.relics.Relics) {
            this.data.relics.Relics.forEach(r => this.definitions.relics[r.id] = r);
        }
        
        if (this.data.affixes && this.data.affixes["Relic Affixes"]) {
            this.data.affixes["Relic Affixes"].forEach(a => this.definitions.affixes[a.id] = a);
        }

        if (this.data.affixes && this.data.affixes.relicUpgradeModifierConfig) {
            this.definitions.defaultUpgradeModifiers = this.data.affixes.relicUpgradeModifierConfig.upgradeModifier;
        }

        this.affixPoolMap = {}; 
        Object.values(this.definitions.relics).forEach(relic => {
            if (relic.primaryAffixPool) {
                relic.primaryAffixPool.forEach(entry => {
                    const id = entry.value ? entry.value.id : null;
                    if (id) {
                        if (!this.affixPoolMap[id]) this.affixPoolMap[id] = { primary: false, secondary: false };
                        this.affixPoolMap[id].primary = true;
                    }
                });
            }
            if (relic.secondaryAffixPool) {
                relic.secondaryAffixPool.forEach(entry => {
                    const id = entry.value ? entry.value.id : null;
                    if (id) {
                        if (!this.affixPoolMap[id]) this.affixPoolMap[id] = { primary: false, secondary: false };
                        this.affixPoolMap[id].secondary = true;
                    }
                });
            }
        });
    }

    loadSaveFile(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.data.save = JSON.parse(e.target.result, secureReviver);
                if (!this.data.save || !this.data.save._relicLoadoutsSaveData) {
                    throw new Error("Invalid save file structure.");
                }
                this.initEditorUI();
            } catch (err) {
                alert(`Error parsing save file: ${err.message}`);
                console.error(err);
            }
        };
        reader.readAsText(file);
    }

    initEditorUI() {
        const saveData = this.data.save._relicLoadoutsSaveData;
        document.getElementById('uploadOverlay').style.display = 'none';
        const select = document.getElementById('loadoutSelect');
        select.innerHTML = '';
        select.disabled = false;

        if (saveData && saveData._loadouts) {
            saveData._loadouts.forEach((l, index) => {
                const opt = document.createElement('option');
                opt.value = index;
                opt.text = `Loadout ${index + 1} (${l.Items.length} items)`;
                select.appendChild(opt);
            });
            select.value = saveData._currentIndex !== undefined ? saveData._currentIndex : 0;
            this.currentLoadoutIndex = parseInt(select.value);
        }

        document.getElementById('downloadBtn').disabled = false;
        this.renderGrid();
    }

    switchLoadout() {
        const select = document.getElementById('loadoutSelect');
        this.currentLoadoutIndex = parseInt(select.value);
        this.selectedRelicIndex = -1;
        this.renderGrid();
        this.renderInspector();
    }

    updateGridSettings(size) {
        document.documentElement.style.setProperty('--grid-cell-size', size + 'px');
        const display = document.getElementById('cellSizeDisplay');
        if (display) display.textContent = size + 'px';
        this.renderGrid();
    }

    renderGrid() {
        if (!this.data.save || !this.data.config) return;
        const container = document.getElementById('gridContainer');
        
        if (!this.relicDomMap) this.relicDomMap = new WeakMap();

        const shapeConfig = this.data.config.playerInventoryShapeTiers;
        const currentShape = shapeConfig[shapeConfig.length - 1]; 
        
        const width = currentShape.width;
        const height = currentShape.height;

        const totalSlots = width * height;
        const existingSlots = container.querySelectorAll('.grid-slot');
        
        if (existingSlots.length !== totalSlots) {
            container.innerHTML = ''; 
            container.style.gridTemplateColumns = `repeat(${width}, var(--grid-cell-size))`;
            container.style.gridTemplateRows = `repeat(${height}, var(--grid-cell-size))`;

            currentShape.shape.forEach(isValid => {
                const div = document.createElement('div');
                div.className = `grid-slot ${isValid ? '' : 'blocked'}`;
                container.appendChild(div);
            });
        }

        const loadout = this.data.save._relicLoadoutsSaveData._loadouts[this.currentLoadoutIndex];
        const cellSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-cell-size'));
        const gap = 4;

        const currentRelics = container.querySelectorAll('.relic-item');
        currentRelics.forEach(el => el.dataset.stale = "true");

        loadout.Items.forEach((item, index) => {
            const def = this.definitions.relics[item._relicBaseDefinitionID];
            const size = this.getRelicSize(def);
            const contentSignature = `${def.id}-${item._tier}-${item._eRelicRarity}`;

            let el = this.relicDomMap.get(item);

            if (!el || !container.contains(el)) {
                el = document.createElement('div');
                this.relicDomMap.set(item, el); 
                container.appendChild(el);
                el.dataset.signature = 'new'; 
            }

            el.onmousedown = (e) => {
                e.stopPropagation(); 
                this.dragManager.initDrag(e, item, index, el, 'main');
            };

            el.onmouseenter = (e) => this.tooltipManager.showTooltip(e, item);
            el.onmousemove = (e) => this.tooltipManager.moveTooltip(e);
            el.onmouseleave = () => this.tooltipManager.hideTooltip();

            el.oncontextmenu = (e) => {
                e.preventDefault(); 
                e.stopPropagation();
                this.dragManager.startCopy(e, item);
            };

            el.dataset.stale = "false";
            el.dataset.index = index; 

            const isSelected = (this.selectedContainer === 'main' && index === this.selectedRelicIndex);
            el.className = `relic-item rarity-${item._eRelicRarity} ${isSelected ? 'selected' : ''}`;

            const visualY = height - item._position.y - size.h;
            el.style.left = `${item._position.x * (cellSize + gap) + 10}px`; 
            el.style.top = `${visualY * (cellSize + gap) + 10}px`;
            el.style.width = `${size.w * cellSize + (size.w - 1) * gap}px`;
            el.style.height = `${size.h * cellSize + (size.h - 1) * gap}px`;

            if (el.dataset.signature !== contentSignature) {
                this.renderRelicContent(el, def, item._tier, item._eRelicRarity);
                el.dataset.signature = contentSignature;
            }
        });

        const staleRelics = container.querySelectorAll('.relic-item[data-stale="true"]');
        staleRelics.forEach(el => el.remove());

        this.renderStash();
    }

    renderStash() {
        const container = document.getElementById('stashContainer');
        
        if (!this.relicDomMap) this.relicDomMap = new WeakMap();

        const totalSlots = this.stashWidth * this.stashHeight;
        const existingSlots = container.querySelectorAll('.grid-slot');

        if (existingSlots.length !== totalSlots) {
            container.innerHTML = '';
            container.style.gridTemplateColumns = `repeat(${this.stashWidth}, ${this.stashCellSize}px)`;
            container.style.gridTemplateRows = `repeat(${this.stashHeight}, ${this.stashCellSize}px)`;
            
            for(let i=0; i<totalSlots; i++) {
                const div = document.createElement('div');
                div.className = 'grid-slot';
                div.style.width = `${this.stashCellSize}px`;
                div.style.height = `${this.stashCellSize}px`;
                container.appendChild(div);
            }
        }

        const currentRelics = container.querySelectorAll('.relic-item');
        currentRelics.forEach(el => el.dataset.stale = "true");

        const cellSize = this.stashCellSize;
        const gap = 4;

        this.stashItems.forEach((item, index) => {
            const def = this.definitions.relics[item._relicBaseDefinitionID];
            const size = this.getRelicSize(def);
            const contentSignature = `${def.id}-${item._tier}-${item._eRelicRarity}`;

            let el = this.relicDomMap.get(item);

            if (!el || !container.contains(el)) {
                el = document.createElement('div');
                this.relicDomMap.set(item, el);
                container.appendChild(el);
                el.dataset.signature = 'new';
            }

            el.onmousedown = (e) => {
                e.stopPropagation();
                this.dragManager.initDrag(e, item, index, el, 'stash');
            };

            el.onmouseenter = (e) => this.tooltipManager.showTooltip(e, item);
            el.onmousemove = (e) => this.tooltipManager.moveTooltip(e);
            el.onmouseleave = () => this.tooltipManager.hideTooltip();

            el.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dragManager.startCopy(e, item);
            };

            el.dataset.stale = "false";
            el.dataset.index = index;

            const isSelected = (this.selectedContainer === 'stash' && index === this.selectedRelicIndex);
            el.className = `relic-item rarity-${item._eRelicRarity} ${isSelected ? 'selected' : ''}`;

            el.style.left = `${item._position.x * (cellSize + gap) + 10}px`; 
            el.style.top = `${item._position.y * (cellSize + gap) + 10}px`;
            el.style.width = `${size.w * cellSize + (size.w - 1) * gap}px`;
            el.style.height = `${size.h * cellSize + (size.h - 1) * gap}px`;

            if (el.dataset.signature !== contentSignature) {
                this.renderRelicContent(el, def, item._tier, item._eRelicRarity);
                el.dataset.signature = contentSignature;
            }
        });

        const staleRelics = container.querySelectorAll('.relic-item[data-stale="true"]');
        staleRelics.forEach(el => el.remove());
    }

    renderInspector() {
        const container = document.getElementById('inspectorContent');
        container.innerHTML = '';

        const item = this.getSelectedItem(); 

        if (!item) {
            container.innerHTML = '<p style="color: #666; font-style: italic;">Select a relic to edit details.</p>';
            return;
        }

        const def = this.definitions.relics[item._relicBaseDefinitionID];

        const headerRow = document.createElement('div');
        headerRow.style.marginBottom = '12px';
        
        const nameEl = document.createElement('h3');
        nameEl.style.margin = '0';
        nameEl.style.fontSize = '1.1rem';
        nameEl.style.lineHeight = '1.3';
        nameEl.style.color = 'var(--text-color)';
        nameEl.textContent = this.getRelicName(def, item._tier || 1);
        
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
            this.renderGrid();
            this.renderStash();
        }));

        const rarityOpts = [
            { value: 0, text: 'Common' },
            { value: 1, text: 'Magic' },
            { value: 2, text: 'Rare' },
            { value: 3, text: 'Unique' }
        ];

        statsGrid.appendChild(createSelect('Rarity', item._eRelicRarity, rarityOpts, (v) => {
            item._eRelicRarity = v;
            this.renderGrid(); 
        }));

        container.appendChild(statsGrid);

        const hasHighRolls = (item._affixesData && item._affixesData.some(a => a._rollValue > 1.0)) || 
                             (item._implicitAffixesData && item._implicitAffixesData.some(i => i._relicAffixData._rollValue > 1.0));
        const isUnlocked = (this.ui_unlockLimits !== undefined) ? this.ui_unlockLimits : hasHighRolls;

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
        unlockLabel.querySelector('input').onchange = (e) => this.toggleLimitUnlock(e.target.checked);
        
        unlockDiv.appendChild(unlockLabel);
        container.appendChild(unlockDiv);

        const currentLevel = item._upgradeLevel;
        if (!item._affixesData) item._affixesData = [];
        if (!item._implicitAffixesData) item._implicitAffixesData = [];

        const primaryPool = this.getAllowedAffixIds(item._relicBaseDefinitionID, 'primary');
        const uniqueList = [];
        const primaryList = [];
        const secondaryList = [];

        item._affixesData.forEach((affix, index) => {
            const aDef = this.definitions.affixes[affix._relicAffixDefinitionId];
            const isUnique = aDef && (aDef.eAffixRarity === 'Unique' || aDef.eAffixRarity === 'Special');
            const entry = { affix: affix, index: index };
            if (isUnique) uniqueList.push(entry);
            else if (primaryPool.includes(affix._relicAffixDefinitionId)) primaryList.push(entry);
            else secondaryList.push(entry);
        });

        const isPriFull = this.hasReachedAffixLimit(item, 'primary');
        const isSecFull = this.hasReachedAffixLimit(item, 'secondary');
        const isUniqueOrRareFull = uniqueList.length > 0;

        const btnRare = [{
            label: '+ Add Rare',
            disabled: isUniqueOrRareFull, 
            onClick: () => {
                this.activeAffixType = 'rare'; 
                this.openAffixModal(null, (id) => this.addSpecificAffix(id));
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
        const isImplicitFull = this.restrictAffixes && implicitCount >= 2;

        const btnImplicit = [{
            label: '+ Add Implicit',
            disabled: isImplicitFull,
            onClick: () => {
                this.activeAffixType = 'implicit'; 
                this.openAffixModal(null, (id) => {
                    this.addAffix(true, id);
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
        if (!this.restrictAffixes || maxPrimary > 0 || primaryList.length > 0) {
            const btnPrimary = [{
                label: '+ Add Primary',
                disabled: isPriFull,
                onClick: () => {
                    this.activeAffixType = 'primary';
                    this.openAffixModal(null, (id) => this.addSpecificAffix(id));
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
                this.activeAffixType = 'secondary';
                this.openAffixModal(null, (id) => this.addSpecificAffix(id));
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
            const def = this.definitions.affixes[defId];
            const range = this.getAffixRange(defId, tier);

            const div = document.createElement('div');
            div.className = 'affix-item';
            
            let typeLabelContainer = null;
            
            if (isImplicit) {
                if (loopIndex >= 3) div.style.opacity = '0.6';
                const cats = this.getAffixCategory(defId);
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
                        span.textContent = this.getImplicitCategoryName(c);
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
            nameBtn.textContent = this.getAffixName(defId);
            
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
                    this.activeAffixType = contextType; 
                    this.openAffixModal(defId, (newId) => {
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

            const overrideConfig = this.getAdditiveOverrideConfig(def);
            if (overrideConfig) {
                const val = parseFloat(overrideConfig[level] || 0);
                if (val !== 0) {
                    const displayVal = val >= 0 ? `+${val}` : val;
                    tagsDiv.innerHTML += `<span class="tag-mini" style="color:#79c0ff; border-color:rgba(121, 192, 255, 0.4);">${displayVal}</span>`;
                }
            } else {
                const mult = this.getUpgradeMultiplier(level, def);
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
            calcVal.textContent = this.calculateRealValue(affixData._rollValue, range, level, def);
            rightGroup.appendChild(calcVal);

            if (allowLock) {
                const lockLabel = document.createElement('label');
                lockLabel.className = 'lock-label';
                lockLabel.innerHTML = `<input type="checkbox" ${affixData._locked ? 'checked' : ''}> Lock`;
                lockLabel.querySelector('input').onchange = (e) => this.updateAffixLock(originalIndex, e.target.checked, false);
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
            setTimeout(() => this.updateSliderFill(slider), 0);

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
                else { slider.value = v; this.updateSliderFill(slider); }
                if (range) calcVal.textContent = this.calculateRealValue(v, range, level, def);
            };

            slider.oninput = (e) => { updateVal(e.target.value, 'slider'); this.updateSliderFill(e.target); };
            numInput.onchange = (e) => updateVal(e.target.value, 'input');

            controls.appendChild(slider);
            controls.appendChild(numInput);

            if (allowRemove && !isStrictlyUnique) {
                const btnRemove = document.createElement('button');
                btnRemove.className = 'btn-remove-danger';
                btnRemove.textContent = 'Remove';
                btnRemove.onclick = () => this.removeAffix(originalIndex, isImplicit);
                controls.appendChild(btnRemove);
            }

            div.appendChild(controls);
            list.appendChild(div);
        });
        
        container.appendChild(list);
    }

    openAffixModal(currentId, callback) {
        this.pendingAffixCallback = callback;
        this.editingAffixId = currentId;
        
        const modal = document.getElementById('affixModal');
        const input = document.getElementById('affixSearchInput');

        document.getElementById('affixFilterSelect').value = 'all';
        
        modal.style.display = 'flex';
        input.value = '';
        input.focus();
        
        this.allAffixOptions = Object.values(this.definitions.affixes).map(def => ({
            id: def.id,
            name: this.getAffixName(def.id),
            rawDef: def
        })).sort((a, b) => a.name.localeCompare(b.name));

        this.filterAffixes();
    }

    closeModal() {
        document.getElementById('affixModal').style.display = 'none';
        this.pendingAffixCallback = null;
    }

    filterAffixes() {
        const rawQuery = document.getElementById('affixSearchInput').value.toLowerCase().trim();
        const filterType = document.getElementById('affixFilterSelect').value; 
        
        let allowedIds = []; 
        let itemHasType = false;      
        let itemHasCorrupted = false; 

        if (this.restrictSearch && this.activeAffixType && this.selectedRelicIndex !== -1) {
             const item = this.getSelectedItem();
             if (item) {
                 if (this.activeAffixType === 'implicit') {
                     const currentImplicits = item._implicitAffixesData || [];
                     currentImplicits.forEach(imp => {
                         const impId = imp._relicAffixData._relicAffixDefinitionId;
                         if (this.editingAffixId && String(impId) === String(this.editingAffixId)) return; 
                         const impCats = this.getAffixCategory(impId);
                         if (impCats.some(c => c >= 0 && c <= 2)) itemHasType = true;
                         if (impCats.includes(3)) itemHasCorrupted = true;
                     });
                 } else if (this.activeAffixType === 'rare') {
                     allowedIds = []; 
                 } else {
                     const list = this.getAllowedAffixIds(item._relicBaseDefinitionID, this.activeAffixType);
                     allowedIds = list || []; 
                 }
             }
        }

        const queryTokens = rawQuery.split(/[\s-]+/).filter(t => t.length > 0);

        const filtered = this.allAffixOptions.filter(opt => {
            const def = opt.rawDef;
            const name = opt.name.toLowerCase();
            const id = String(opt.id);

            if (def.eAffixRarity === 'Unique') return false;

            if (this.restrictSearch && this.activeAffixType) {
                if (this.activeAffixType === 'implicit') {
                    const candCats = this.getAffixCategory(def.id);
                    if (candCats.length === 0) return false;
                    const candHasType = candCats.some(c => c >= 0 && c <= 2);
                    const candHasCorrupted = candCats.includes(3);

                    if (itemHasType && candHasType) return false;
                    if (itemHasCorrupted && candHasCorrupted) return false;

                    if (this.editingAffixId) {
                        const srcCats = this.getAffixCategory(this.editingAffixId);
                        const srcIsType = srcCats.some(c => c >= 0 && c <= 2);
                        const srcIsCorrupted = srcCats.includes(3);
                        if (srcIsType && !srcIsCorrupted && !candHasType) return false;
                        if (srcIsCorrupted && !srcIsType && !candHasCorrupted) return false;
                    }
                } else if (this.activeAffixType === 'rare') {
                    if (def.eAffixRarity !== 'Special') return false;
                } else {
                    const isAllowed = allowedIds.some(allowedId => String(allowedId) === String(def.id));
                    if (!isAllowed) return false;
                }
            }

            let typeMatch = true;
            if (filterType !== 'all') {
                const isUnique = def.eAffixRarity === 'Unique';
                const isSpecial = def.eAffixRarity === 'Special';
                const candCats = this.getAffixCategory(def.id);
                
                switch (filterType) {
                    case 'unique': typeMatch = isUnique; break;
                    case 'rare': typeMatch = isSpecial; break;
                    case 'corrupted': typeMatch = candCats.includes(3); break;
                    case 'fury': typeMatch = candCats.includes(0); break;
                    case 'faith': typeMatch = candCats.includes(1); break;
                    case 'discipline': typeMatch = candCats.includes(2); break;
                    case 'none': typeMatch = !isUnique && !isSpecial && candCats.length === 0; break;
                }
            }
            if (!typeMatch) return false;

            if (queryTokens.length === 0) return true;
            if (name.includes(rawQuery) || id.includes(rawQuery)) {
                opt._matchType = 'exact';
                return true;
            }

            const nameTokens = name.split(/[\s-]+/);
            const allTokensMatched = queryTokens.every(qToken => {
                if (nameTokens.some(nT => nT.includes(qToken))) return true;
                if (qToken.length >= 3) {
                    const maxEdits = qToken.length > 5 ? 2 : 1;
                    return nameTokens.some(nT => {
                        if (Math.abs(nT.length - qToken.length) > maxEdits) return false;
                        return getLevenshteinDistance(qToken, nT) <= maxEdits;
                    });
                }
                return false;
            });

            if (allTokensMatched) {
                opt._matchType = 'fuzzy';
                return true;
            }
            return false;
        });

        filtered.sort((a, b) => {
            if (a._matchType === 'exact' && b._matchType !== 'exact') return -1;
            if (a._matchType !== 'exact' && b._matchType === 'exact') return 1;
            return a.name.localeCompare(b.name);
        });

        this.renderAffixSearchList(filtered);
    }

    renderAffixSearchList(items) {
        const container = document.getElementById('affixSearchResults');
        container.innerHTML = '';
        
        if (items.length === 0) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'padding: 20px; text-align: center; color: var(--text-muted); display: flex; flex-direction: column; gap: 10px; align-items: center;';

            if (this.restrictSearch) {
                wrapper.innerHTML = `
                    <div style="font-size: 0.9em;">
                        <strong style="display:block; color: var(--text-color); margin-bottom: 5px;">No valid affixes found.</strong>
                        The current slot or item limits prevent adding more affixes of this type.
                    </div>
                    <div style="font-size: 0.8em; color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); background: rgba(210, 153, 34, 0.1); padding: 8px; border-radius: 4px; max-width: 280px;">
                        <strong>Warning:</strong> Disabling search restrictions allows you to add <em>any</em> affix, but may result in illegal relics.
                    </div>
                `;
                const btn = document.createElement('button');
                btn.textContent = "Disable Search Restrictions";
                btn.className = "btn-add"; 
                btn.style.cssText = "width: auto; margin-top: 5px; background-color: #21262d; border-color: var(--border-color); color: var(--text-color);";
                btn.onclick = () => {
                    const chk = document.getElementById('chk-search-restrict');
                    if (chk) {
                        chk.checked = false;
                        this.toggleSearchRestrictions(chk); 
                    }
                };
                wrapper.appendChild(btn);
            } else {
                wrapper.textContent = 'No affixes found matching your search.';
            }
            container.appendChild(wrapper);
            return;
        }

        items.forEach(item => {
            const def = item.rawDef;
            const div = document.createElement('div');
            div.className = 'search-item';

            let tagsHtml = '';
            const poolInfo = this.affixPoolMap ? this.affixPoolMap[def.id] : null;
            if (poolInfo) {
                if (poolInfo.primary) tagsHtml += `<span class="tag-badge tag-primary">Primary</span>`;
                if (poolInfo.secondary) tagsHtml += `<span class="tag-badge tag-secondary">Secondary</span>`;
            }

            const isUnique = def.eAffixRarity === 'Unique';
            const isSpecial = def.eAffixRarity === 'Special';
            if (isUnique) tagsHtml += `<span class="tag-badge tag-unique">Unique</span>`;
            else if (isSpecial) tagsHtml += `<span class="tag-badge tag-rare">Rare</span>`;

            const cats = this.getAffixCategory(def.id);
            cats.forEach(catId => {
                if (catId === 3) return; 
                const catName = this.getImplicitCategoryName(catId);
                const catClass = `tag-${catName.toLowerCase()}`;
                tagsHtml += `<span class="tag-badge ${catClass}">${catName}</span>`;
            });

            if (cats.includes(3)) tagsHtml += `<span class="tag-badge tag-corrupted">Corrupted</span>`;
            if (tagsHtml === '') tagsHtml += `<span class="tag-badge tag-unavailable">Not Attainable</span>`;

            const leftDiv = document.createElement('div');
            leftDiv.className = 'search-item-left';
            const strong = document.createElement('strong');
            strong.textContent = item.name; 
            const tagContainer = document.createElement('div');
            tagContainer.className = 'tag-container';
            tagContainer.innerHTML = tagsHtml;
            leftDiv.appendChild(strong);
            leftDiv.appendChild(tagContainer);

            const rightDiv = document.createElement('div');
            rightDiv.className = 'search-item-right';
            rightDiv.textContent = `#${def.id}`;

            div.appendChild(leftDiv);
            div.appendChild(rightDiv);
            
            div.onclick = () => {
                if (this.pendingAffixCallback) this.pendingAffixCallback(item.id);
                this.closeModal();
            };
            container.appendChild(div);
        });
    }

    openCreationModal() {
        const modal = document.getElementById('creationModal');
        const listContainer = document.getElementById('unifiedRelicList');
        listContainer.innerHTML = '';

        if (!this.data.relics || !this.data.relics.Relics) {
            alert("Relic database not loaded yet.");
            return;
        }

        const filtered = this.data.relics.Relics.filter(r => {
            if (r.name.includes("_Tier4")) return true;
            if (r.type === "UniqueRelicBaseDefinition") return true;
            return false;
        });

        filtered.sort((a, b) => {
            const aIsTier4 = a.name.includes("_Tier4");
            const bIsTier4 = b.name.includes("_Tier4");
            if (aIsTier4 && bIsTier4) return a.name.localeCompare(b.name);
            if (aIsTier4 && !bIsTier4) return -1;
            if (!aIsTier4 && bIsTier4) return 1;
            return a.name.localeCompare(b.name);
        });

        filtered.forEach(relic => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'search-item';
            itemDiv.dataset.name = relic.name.toLowerCase();
            
            const flexRow = document.createElement('div');
            flexRow.style.cssText = "display:flex; justify-content:space-between; align-items:center; width:100%";

            const leftCol = document.createElement('div');
            leftCol.style.cssText = "overflow:hidden; text-overflow:ellipsis;";

            const strongName = document.createElement('strong');
            strongName.textContent = relic.name; 
            leftCol.appendChild(strongName);

            if (!relic.name.includes("_Tier4")) {
                const labelDiv = document.createElement('div');
                labelDiv.style.marginTop = "2px";
                const uniqueBadge = document.createElement('span');
                uniqueBadge.textContent = "UNIQUE";
                uniqueBadge.style.cssText = "color:#f85149; font-size:0.8em; border:1px solid #f85149; padding:0 4px; border-radius:4px;";
                labelDiv.appendChild(uniqueBadge);
                leftCol.appendChild(labelDiv);
            }

            const btn = document.createElement('button');
            btn.className = "btn-add";
            btn.textContent = "Create";
            btn.style.cssText = "width:auto; padding:4px 12px; margin-left:10px;";
            btn.onclick = (e) => this.createRelic(e, relic.id);

            flexRow.appendChild(leftCol);
            flexRow.appendChild(btn);
            itemDiv.appendChild(flexRow);
            listContainer.appendChild(itemDiv);
        });

        modal.style.display = 'flex';
        document.getElementById('relicSearchInput').focus();
    }

    closeCreationModal() {
        document.getElementById('creationModal').style.display = 'none';
        document.getElementById('relicSearchInput').value = ''; 
    }

    filterCreationList() {
        const term = document.getElementById('relicSearchInput').value.toLowerCase();
        const items = document.querySelectorAll('#creationModal .search-item');
        items.forEach(item => {
            const name = item.dataset.name;
            item.style.display = name.includes(term) ? 'block' : 'none';
        });
    }

    createRelic(e, relicDefId) {
        this.closeCreationModal();
        const def = this.definitions.relics[relicDefId];
        if (!def) return console.error("Relic definition not found");

        let targetTier = 4;     
        let targetRarity = 1;   
        let targetLevel = 0;    

        const tierMatch = def.name.match(/_Tier(\d+)/);
        if (tierMatch) {
            targetTier = 4;
            targetRarity = 2; 
            targetLevel = 5;
        } else {
            targetTier = 4; 
            targetRarity = 3; 
            targetLevel = 5;  
        }

        const newRelic = {
            _relicBaseDefinitionID: def.id,
            _position: { x: 0, y: 0 }, 
            _tier: targetTier,
            _upgradeLevel: targetLevel,
            _eRelicRarity: targetRarity,
            _affixesData: [],
            _implicitAffixesData: []
        };

        if (def.intrinsicAffixes && Array.isArray(def.intrinsicAffixes)) {
            def.intrinsicAffixes.forEach(affixDef => {
                newRelic._affixesData.push({
                    _relicAffixDefinitionId: affixDef.id,
                    _rollValue: 0.5,
                    _locked: false,
                    _tier: newRelic._tier
                });
            });
        }

        const size = this.getRelicSize(def);
        const el = document.createElement('div');
        el.className = `relic-item rarity-${newRelic._eRelicRarity} dragging`;
        this.renderRelicContent(el, def, newRelic._tier);
        
        const currentCellSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-cell-size'));
        const gap = 4;
        el.style.width = `${size.w * currentCellSize + (size.w - 1) * gap}px`;
        el.style.height = `${size.h * currentCellSize + (size.h - 1) * gap}px`;
        
        el.style.position = 'fixed';
        el.style.zIndex = 9999;
        el.style.left = `${e.clientX - (parseInt(el.style.width)/2)}px`; 
        el.style.top = `${e.clientY - (parseInt(el.style.height)/2)}px`;
        el.style.pointerEvents = 'none';

        document.body.appendChild(el);
        this.dragManager.initDrag(e, newRelic, -1, el, 'copy_mode');
        this.dragManager.isDragging = true;
        this.dragManager.dragGap = 4;
        
        const rect = el.getBoundingClientRect();
        this.dragManager.dragOffsetX = e.clientX - rect.left;
        this.dragManager.dragOffsetY = e.clientY - rect.top;
    }

    calculateRealValue(roll, range, level, def) {
        let val = roll;
        if (range && range.length === 2) {
            val = range[0] + (range[1] - range[0]) * roll;
        }

        const override = def.upgradeModifierOverride ? parseFloat(def.upgradeModifierOverride[level] || 0) : null;
        const multiplier = override !== null ? override : this.getUpgradeMultiplier(level, def) || 1;
        const config = def.relicUpgradeModifierConfig || {};
        const upgradeModType = config.modifierType || def.modifierType || "Additive";
        const upgradeModifierConfig = def.relicUpgradeModifierConfig && def.relicUpgradeModifierConfig.length != 0

        if (upgradeModType === "Multiplicative" || upgradeModifierConfig) {
            val *= multiplier;
        } else {
            val += multiplier;
        }

        let format = "NoFormat"; 
        let vars = [];
        if (def.behaviorData && def.behaviorData.variables && def.behaviorData.variables.variables) {
            vars = def.behaviorData.variables.variables;
        } else if (def.variables && def.variables.variables) {
            vars = def.variables.variables;
        }

        const formatVar = vars.find(v => v.name === "Roll") || vars[0];
        if (formatVar && formatVar.eSkillEffectVariableFormat) {
            format = formatVar.eSkillEffectVariableFormat;
        } else if (def.statModifierType) {
            format = def.statModifierType; 
        }

        switch (format) {
            case "Percentage":
                const pct = Math.abs((val * 100).toFixed(2));
                return `${pct}%`;
            case "MultiplicativeAdditive":
                if (val > 1) val -= 1;
                const multiAddPct = (val * 100).toFixed(2);
                const multiAddSign = multiAddPct >= 0 ? "+" : ""; 
                return `${multiAddSign}${multiAddPct}%[+]`;
            case "Multiplicative":
                return `${parseFloat(((val - 1) * 100).toFixed(2))}%[x]`;
            case "Additive":
                const addSign = val >= 0 ? "+" : "";
                if (!Number.isInteger(range[0])) return `${addSign}${parseFloat((val * 100).toFixed(2))}%`;
                return `${addSign}${parseFloat(val.toFixed(2))}`;
            case "Rounded":
                return Math.round(val).toString();
            case "NoFormat":
            default:
                return parseFloat(val.toFixed(2)).toString();
        }
    }

    toggleLimitUnlock(isChecked) {
        this.ui_unlockLimits = isChecked;
        this.renderInspector();
    }

    getSelectedItem() {
        if (this.selectedRelicIndex === -1) return null;
        if (this.selectedContainer === 'stash') return this.stashItems[this.selectedRelicIndex];
        if (this.currentLoadoutIndex !== -1 && this.data.save) {
            const loadout = this.data.save._relicLoadoutsSaveData._loadouts[this.currentLoadoutIndex];
            if (loadout && loadout.Items) return loadout.Items[this.selectedRelicIndex];
        }
        return null;
    }

    updateAffixLock(affixIndex, isLocked, isImplicit) {
        const item = this.getSelectedItem();
        if (!item) return;
        if (isImplicit) {
             if (item._implicitAffixesData && item._implicitAffixesData[affixIndex] && item._implicitAffixesData[affixIndex]._relicAffixData) {
                 item._implicitAffixesData[affixIndex]._relicAffixData._locked = isLocked;
             }
        } else {
             if (item._affixesData && item._affixesData[affixIndex]) {
                 item._affixesData[affixIndex]._locked = isLocked;
             }
        }
    }

    addAffix(isImplicit, specificId = 0) {
        const item = this.getSelectedItem();
        if (!item) return;
        const idToUse = specificId !== undefined ? parseInt(specificId) : 0;
        const newAffix = {
            _relicAffixDefinitionId: idToUse, 
            _rollValue: 0.5,
            _locked: false,
            _tier: item._tier || 1
        };

        if (isImplicit) {
            if (!item._implicitAffixesData) item._implicitAffixesData = [];
            if (this.restrictAffixes && item._implicitAffixesData.length >= 2) {
                alert("Implicit limit reached (Max 2).");
                return;
            }
            item._implicitAffixesData.push({ _relicAffixData: newAffix });
        } else {
            if (!item._affixesData) item._affixesData = [];
            item._affixesData.push(newAffix);
        }
        this.renderInspector();
    }

    removeAffix(index, isImplicit) {
        const item = this.getSelectedItem();
        if (!item) return;
        if (isImplicit && item._implicitAffixesData) {
            item._implicitAffixesData.splice(index, 1);
        } else if (!isImplicit && item._affixesData) {
            item._affixesData.splice(index, 1);
        }
        this.renderInspector();
    }

    getRelicName(def, tier) {
        if (!def) return 'Unknown';
        const currentName = def.name || 'Unknown';
        if (!tier) return currentName;
        const splitPattern = /_Tier\d+/i;
        const nameParts = currentName.split(splitPattern);
        if (nameParts.length < 2) return currentName;
        const baseName = nameParts[0]; 
        const targetPrefix = `${baseName}_Tier${tier}`;
        const allRelics = Object.values(this.definitions.relics);
        const match = allRelics.find(r => r.name && r.name.startsWith(targetPrefix));
        if (match) return match.name;
        return currentName;
    }

    formatRelicDisplay(name) {
        if (!name) return 'Unknown';
        const parts = name.split(' - ');
        if (parts.length >= 3) return parts[1].trim();
        return name;
    }

    getAffixName(affixId) {
        const def = this.definitions.affixes[affixId];
        if (!def) return `ID: ${affixId}`;
        if (def.name) return formatString(def.name);
        if (def.eStatDefinition) return formatString(def.eStatDefinition);
        if (Array.isArray(def.nameLocalizationKey)) {
            const en = def.nameLocalizationKey.find(k => k.langCode === 'en');
            return en ? en.langTranslation : def.nameLocalizationKey[0].langTranslation;
        }
        return `ID: ${affixId}`;
    }

    getAffixRange(affixId, tier) {
        const def = this.definitions.affixes[affixId];
        if (!def || !def.tierRollRanges) return null;
        const tierData = def.tierRollRanges.find(t => t.tier === tier);
        return tierData ? tierData.rollRange : null; 
    }

    getUpgradeMultiplier(level, affixDef) {
        let mods = null;
        if (affixDef && affixDef.relicUpgradeModifierConfig && affixDef.relicUpgradeModifierConfig.upgradeModifier) {
            mods = affixDef.relicUpgradeModifierConfig.upgradeModifier;
        } else if (this.definitions.defaultUpgradeModifiers) {
            mods = this.definitions.defaultUpgradeModifiers;
        } else {
            mods = this.definitions.fallbackUpgradeModifiers;
        }
        if (mods) {
            const val = mods[String(level)];
            return val !== undefined ? parseFloat(val) : 1.0;
        }
        return 1.0;
    }

    getAdditiveOverrideConfig(affixDef) {
        if (!affixDef) return null;
        if (affixDef.upgradeModifierOverride) return affixDef.upgradeModifierOverride;
        if (affixDef.relicUpgradeModifierConfig && affixDef.relicUpgradeModifierConfig.upgradeModifierOverride) {
            return affixDef.relicUpgradeModifierConfig.upgradeModifierOverride;
        }
        return null;
    }

    getImplicitCategoryName(catId) {
        switch(catId) {
            case 0: return "Fury";       
            case 1: return "Faith";      
            case 2: return "Discipline";
            case 3: return "Corrupted";
            default: return "None";
        }
    }

    getRelicSize(relicDef) {
        if (!relicDef) return this.definitions.sizes.Default;
        return this.definitions.sizes[relicDef.eRelicSize] || this.definitions.sizes.Default;
    }

    updateSliderFill(input) {
        if (!input) return;
        const min = parseFloat(input.min) || 0;
        const max = parseFloat(input.max) || 100;
        const val = parseFloat(input.value) || 0;
        const percent = ((val - min) / (max - min)) * 100;
        input.style.setProperty('--range-percent', `${percent}%`);
    }

    toggleRestrictions(checkbox) {
        this.restrictAffixes = checkbox.checked;
        this.renderInspector(); 
    }

    toggleSearchRestrictions(checkbox) {
        this.restrictSearch = checkbox.checked;
        const modal = document.getElementById('affixModal');
        if (modal && modal.style.display !== 'none') {
            this.filterAffixes();
        }
    }

    hasReachedAffixLimit(relicItem, type) {
        if (!this.restrictAffixes) return false;
        const def = this.definitions.relics[relicItem._relicBaseDefinitionID];
        if (!def) return false;
        const limitRange = (type === 'primary') ? def.primaryAffixAmount : def.secondaryAffixAmount;
        if (!limitRange) return false;
        const limit = limitRange[1];
        const pool = (type === 'primary') ? def.primaryAffixPool : def.secondaryAffixPool;
        if (!pool) return false;
        const poolIds = pool.map(entry => entry.value.id);
        const currentCount = (relicItem._affixesData || []).filter(affix => 
            poolIds.includes(affix._relicAffixDefinitionId)
        ).length;
        return currentCount >= limit;
    }

    getAllowedAffixIds(relicDefId, type) {
        const def = this.definitions.relics[relicDefId];
        if (!def) return []; 
        const pool = (type === 'primary') ? def.primaryAffixPool : def.secondaryAffixPool;
        if (!pool || !Array.isArray(pool)) return [];
        return pool.map(entry => entry.value && entry.value.id).filter(id => id !== undefined);
    }

    addSpecificAffix(id) {
        const item = this.getSelectedItem();
        if (!item) return;
        const newAffix = {
            _relicAffixDefinitionId: parseInt(id),
            _rollValue: 0.5,
            _locked: false,
            _tier: item._tier || 1
        };
        if (!item._affixesData) item._affixesData = [];
        item._affixesData.push(newAffix);
        this.renderInspector();
    }

    getAffixCategory(defId) {
        const mapping = this.data.implicit_mapping || {};
        const def = this.definitions.affixes[defId];
        if (!def) return [];
        let cats = [];
        const rawMap = mapping[defId];
        if (Array.isArray(rawMap)) {
            cats = [...rawMap];
        } else if (rawMap !== undefined && rawMap !== null) {
            cats = [rawMap];
        }
        if (cats.length === 0) {
            const isUnique = def.eAffixRarity === 'Unique';
            const isSpecial = def.eAffixRarity === 'Special';
            const hasFixedRange = def.tierRollRanges && def.tierRollRanges.some(t => t.rollRange && t.rollRange[0] === t.rollRange[1]);
            if (hasFixedRange && !isUnique && !isSpecial) {
                cats.push(3);
            }
        }
        return cats;
    }

    renderRelicContent(container, def, tier) {
        container.innerHTML = ''; 
        if (!def) return;
        const cacheKey = `${def.id}_${tier || 1}`;
        const configureImage = (imgElement, srcUrl) => {
            imgElement.src = srcUrl;
            imgElement.style.cssText = 'width: 100%; height: 100%; object-fit: contain; pointer-events: none; display: block;';
            imgElement.draggable = false;
            container.title = this.formatRelicDisplay(this.getRelicName(def, tier));
            container.appendChild(imgElement);
        };

        if (this.resolvedImageCache.has(cacheKey)) {
            const img = document.createElement('img');
            configureImage(img, this.resolvedImageCache.get(cacheKey));
            return;
        }

        let spriteName = def.sprite;
        if (!spriteName && def.eRelicSize) {
            const t = tier || 1;
            spriteName = `IconRelic_${def.eRelicSize}${t}`;
        }

        if (spriteName) {
            let baseName = spriteName;
            if (baseName.toLowerCase().endsWith('.png')) {
                baseName = baseName.slice(0, -4);
            }
            const img = document.createElement('img');
            const candidate1 = `icons/${baseName}.png`;
            configureImage(img, candidate1);

            img.onload = () => {
                this.resolvedImageCache.set(cacheKey, img.src);
            };
            
            img.onerror = () => {
                if (!img.dataset.retried) {
                    img.dataset.retried = "true";
                    if (!def.sprite && def.eRelicSize) {
                        const t = tier || 1;
                        const lowerName = `IconRelic_${def.eRelicSize.toLowerCase()}${t}`;
                        const candidate2 = `icons/${lowerName}.png`;
                        img.src = candidate2;
                        return; 
                    }
                }
                console.warn(`Failed to load icon: ${baseName}`);
                img.remove();
                this.renderRelicTextFallback(container, def, tier);
            };
        } else {
            this.renderRelicTextFallback(container, def, tier);
        }
    }

    renderRelicTextFallback(container, def, tier) {
        const realName = this.getRelicName(def, tier);
        const displayName = this.formatRelicDisplay(realName);
        const strong = document.createElement('strong');
        strong.textContent = displayName;
        container.appendChild(strong);
    }

    downloadSave() {
        if (!this.data.save) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.data.save, null, 4));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = "PlayerSave0.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
}

window.app = new RelicEditor();
