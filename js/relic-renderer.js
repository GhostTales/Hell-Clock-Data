export class RelicRenderer {
    constructor(editor) {
        this.editor = editor;
        this.relicDomMap = new WeakMap();
        this.resolvedImageCache = new Map();
    }

    renderGrid() {
        const dataManager = this.editor.dataManager;
        if (!dataManager.data.save || !dataManager.data.config) return;
        const container = document.getElementById('gridContainer');
        
        const shapeConfig = dataManager.data.config.playerInventoryShapeTiers;
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

        const loadout = dataManager.data.save._relicLoadoutsSaveData._loadouts[this.editor.currentLoadoutIndex];
        const cellSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-cell-size'));
        const gap = 4;

        const currentRelics = container.querySelectorAll('.relic-item');
        currentRelics.forEach(el => el.dataset.stale = "true");

        loadout.Items.forEach((item, index) => {
            const def = dataManager.definitions.relics[item._relicBaseDefinitionID];
            const size = dataManager.getRelicSize(def);
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
                this.editor.dragManager.initDrag(e, item, index, el, 'main');
            };

            el.onmouseenter = (e) => this.editor.tooltipManager.showTooltip(e, item);
            el.onmousemove = (e) => this.editor.tooltipManager.moveTooltip(e);
            el.onmouseleave = () => this.editor.tooltipManager.hideTooltip();

            el.oncontextmenu = (e) => {
                e.preventDefault(); 
                e.stopPropagation();
                this.editor.dragManager.startCopy(e, item);
            };

            el.dataset.stale = "false";
            el.dataset.index = index; 

            const isSelected = (this.editor.selectedContainer === 'main' && index === this.editor.selectedRelicIndex);
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
        const dataManager = this.editor.dataManager;
        const container = document.getElementById('stashContainer');
        
        const totalSlots = dataManager.stashWidth * dataManager.stashHeight;
        const existingSlots = container.querySelectorAll('.grid-slot');

        if (existingSlots.length !== totalSlots) {
            container.innerHTML = '';
            container.style.gridTemplateColumns = `repeat(${dataManager.stashWidth}, ${dataManager.stashCellSize}px)`;
            container.style.gridTemplateRows = `repeat(${dataManager.stashHeight}, ${dataManager.stashCellSize}px)`;
            
            for(let i=0; i<totalSlots; i++) {
                const div = document.createElement('div');
                div.className = 'grid-slot';
                div.style.width = `${dataManager.stashCellSize}px`;
                div.style.height = `${dataManager.stashCellSize}px`;
                container.appendChild(div);
            }
        }

        const currentRelics = container.querySelectorAll('.relic-item');
        currentRelics.forEach(el => el.dataset.stale = "true");

        const cellSize = dataManager.stashCellSize;
        const gap = 4;

        dataManager.stashItems.forEach((item, index) => {
            const def = dataManager.definitions.relics[item._relicBaseDefinitionID];
            const size = dataManager.getRelicSize(def);
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
                this.editor.dragManager.initDrag(e, item, index, el, 'stash');
            };

            el.onmouseenter = (e) => this.editor.tooltipManager.showTooltip(e, item);
            el.onmousemove = (e) => this.editor.tooltipManager.moveTooltip(e);
            el.onmouseleave = () => this.editor.tooltipManager.hideTooltip();

            el.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.editor.dragManager.startCopy(e, item);
            };

            el.dataset.stale = "false";
            el.dataset.index = index;

            const isSelected = (this.editor.selectedContainer === 'stash' && index === this.editor.selectedRelicIndex);
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

    renderRelicContent(container, def, tier) {
        const dataManager = this.editor.dataManager;
        container.innerHTML = ''; 
        if (!def) return;
        const cacheKey = `${def.id}_${tier || 1}`;
        const configureImage = (imgElement, srcUrl) => {
            imgElement.src = srcUrl;
            imgElement.style.cssText = 'width: 100%; height: 100%; object-fit: contain; pointer-events: none; display: block;';
            imgElement.draggable = false;
            container.title = this.formatRelicDisplay(dataManager.getRelicName(def, tier));
            container.appendChild(imgElement);
        };

        if (this.resolvedImageCache.has(cacheKey)) {
            const img = document.createElement('img');
            configureImage(img, this.resolvedImageCache.get(cacheKey));
            return;
        }

        let spriteName = def.sprite;
        if (!spriteName && def.eRelicSize && dataManager.data.config && dataManager.data.config.relicTierConfigs) {
            const t = tier || 1;
            const tierConfig = dataManager.data.config.relicTierConfigs.find(c => c.tier === t);
            if (tierConfig && tierConfig.spritePerSize) {
                spriteName = tierConfig.spritePerSize[def.eRelicSize];
            }
            if (!spriteName) spriteName = `IconRelic_${def.eRelicSize}${t}`;
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
        const realName = this.editor.dataManager.getRelicName(def, tier);
        const displayName = this.formatRelicDisplay(realName);
        const strong = document.createElement('strong');
        strong.textContent = displayName;
        container.appendChild(strong);
    }

    formatRelicDisplay(name) {
        if (!name) return 'Unknown';
        const parts = name.split(' - ');
        if (parts.length >= 3) return parts[1].trim();
        return name;
    }

    updateSliderFill(input) {
        if (!input) return;
        const min = parseFloat(input.min) || 0;
        const max = parseFloat(input.max) || 100;
        const val = parseFloat(input.value) || 0;
        const percent = ((val - min) / (max - min)) * 100;
        input.style.setProperty('--range-percent', `${percent}%`);
    }
}
