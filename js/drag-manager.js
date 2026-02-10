// c:\MasterFolder\Programming\Hell-Clock-Data\js\drag-manager.js
export class DragManager {
    constructor(editor) {
        this.editor = editor;
        this.isDragging = false;
        this.dragGap = 4;
        this.deletedItemHistory = [];
        
        this.boundMouseMove = (ev) => this.handleDragMove(ev);
        this.boundMouseUp = (ev) => this.handleDragEnd(ev);
    }

    initDrag(e, item, index, element, source) {
        if (this.isDragging) return;
        if (source !== 'copy_mode' && e.button !== 0) return;
        
        e.preventDefault(); 
        
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        
        this.dragItem = item;
        this.dragIndex = index;
        this.dragElement = element;
        this.dragSource = source;

        const def = this.editor.dataManager.definitions.relics[item._relicBaseDefinitionID];
        this.dragItemSize = this.editor.dataManager.getRelicSize(def);
        
        this.isDragging = false;

        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);
    }

    handleDragMove(e) {
        if (!this.isDragging) {
            const dist = Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY);
            if (dist < 5) return; 

            this.isDragging = true;
            
            const rect = this.dragElement.getBoundingClientRect();
            this.dragOffsetX = this.dragStartX - rect.left;
            this.dragOffsetY = this.dragStartY - rect.top;
            
            this.dragElement.style.position = 'fixed';
            this.dragElement.style.left = rect.left + 'px';
            this.dragElement.style.top = rect.top + 'px';
            this.dragElement.style.zIndex = 9999;
            this.dragElement.style.pointerEvents = 'none'; 
            
            document.body.appendChild(this.dragElement); 
            this.dragElement.classList.add('dragging');

            this.editor.selectedRelicIndex = this.dragIndex;
            this.editor.selectedContainer = this.dragSource;
            this.dragGap = 4;
        }

        if (this.isDragging) {
            const mx = e.clientX;
            const my = e.clientY;

            this.dragElement.style.left = `${mx - this.dragOffsetX}px`;
            this.dragElement.style.top = `${my - this.dragOffsetY}px`;

            const stashRect = document.getElementById('stashContainer').getBoundingClientRect();
            const mainRect = document.getElementById('gridContainer').getBoundingClientRect();

            const stashCenterX = stashRect.left + stashRect.width / 2;
            const mainCenterX = mainRect.left + mainRect.width / 2;

            let t = (mx - stashCenterX) / (mainCenterX - stashCenterX);
            t = Math.max(0, Math.min(1, t));

            const startSize = this.editor.dataManager.stashCellSize;
            const endSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-cell-size'));
            const currentCellSize = startSize + t * (endSize - startSize);

            const w = this.dragItemSize.w;
            const h = this.dragItemSize.h;
            const gap = 4;

            const newPixelW = w * currentCellSize + (w - 1) * gap;
            const newPixelH = h * currentCellSize + (h - 1) * gap;

            this.dragElement.style.width = `${newPixelW}px`;
            this.dragElement.style.height = `${newPixelH}px`;

            const trash = document.getElementById('trashZone');
            const r = trash.getBoundingClientRect();
            if (e.clientX >= r.left && e.clientX <= r.right && 
                e.clientY >= r.top && e.clientY <= r.bottom) {
                trash.classList.add('drag-over');
            } else {
                trash.classList.remove('drag-over');
            }
        }
    }

    handleDragEnd(e) {
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);
        
        document.getElementById('trashZone').classList.remove('drag-over');

        if (!this.isDragging) {
            if (this.dragSource === 'copy_mode') {
                 this.dragElement.remove();
                 return; 
            }
            this.editor.selectedRelicIndex = this.dragIndex;
            this.editor.selectedContainer = this.dragSource; 
            this.editor.renderer.renderGrid();      
            this.editor.inspector.renderInspector(); 
            return;
        }

        this.isDragging = false;
        this.dragElement.remove();

        const mainGrid = document.getElementById('gridContainer');
        const stashGrid = document.getElementById('stashContainer');
        const trashZone = document.getElementById('trashZone');

        const mx = e.clientX;
        const my = e.clientY;

        let targetType = null;
        const isInside = (r) => mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom;

        if (isInside(mainGrid.getBoundingClientRect())) {
            targetType = 'main';
        } else if (isInside(stashGrid.getBoundingClientRect())) {
            targetType = 'stash';
        } else if (isInside(trashZone.getBoundingClientRect())) {
            targetType = 'trash';
        }

        if (targetType) {
            this.attemptDrop(targetType, mx, my);
        } else {
            if (this.dragSource !== 'copy_mode') {
                this.editor.renderer.renderGrid();
            }
        }
    }

    attemptDrop(targetType, mouseX, mouseY) {
        if (targetType === 'trash') {
            if (this.dragSource === 'copy_mode') return;
            
            this.deletedItemHistory.push({
                item: this.dragItem,
                source: this.dragSource, 
                originalPos: { ...this.dragItem._position } 
            });

            if (this.dragSource === 'main') {
                const loadout = this.editor.dataManager.data.save._relicLoadoutsSaveData._loadouts[this.editor.currentLoadoutIndex];
                loadout.Items.splice(this.dragIndex, 1);
            } else if (this.dragSource === 'stash') {
                this.editor.dataManager.stashItems.splice(this.dragIndex, 1);
            }
            
            this.editor.selectedRelicIndex = -1;
            this.editor.renderer.renderGrid();
            this.editor.inspector.renderInspector();
            return;
        }

        const isStash = (targetType === 'stash');
        const container = isStash ? document.getElementById('stashContainer') : document.getElementById('gridContainer');
        const rect = container.getBoundingClientRect();
        
        let targetCellSize;
        if (isStash) {
            targetCellSize = this.editor.dataManager.stashCellSize;
        } else {
            targetCellSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-cell-size'));
        }
        
        const gridPadding = 10;
        const gapVal = this.dragGap || 4; 
        const dragTotalUnit = targetCellSize + gapVal;
        
        const scrollX = container.scrollLeft || 0;
        const scrollY = container.scrollTop || 0;

        const relX = mouseX - rect.left + scrollX - this.dragOffsetX - gridPadding;
        const relY = mouseY - rect.top + scrollY - this.dragOffsetY - gridPadding;
        
        const targetX = Math.round(relX / dragTotalUnit);
        const visualY = Math.round(relY / dragTotalUnit);

        let gridW, gridH, targetArray;
        let finalDataY = visualY; 
        
        const shapeConfig = this.editor.dataManager.data.config.playerInventoryShapeTiers;
        const currentShape = shapeConfig[shapeConfig.length - 1];
        const loadout = this.editor.dataManager.data.save._relicLoadoutsSaveData._loadouts[this.editor.currentLoadoutIndex];
        const def = this.editor.dataManager.definitions.relics[this.dragItem._relicBaseDefinitionID];
        const size = this.editor.dataManager.getRelicSize(def);

        if (isStash) {
            gridW = this.editor.dataManager.stashWidth;
            gridH = this.editor.dataManager.stashHeight;
            targetArray = this.editor.dataManager.stashItems;
        } else {
            gridW = currentShape.width;
            gridH = currentShape.height;
            targetArray = loadout.Items;
            finalDataY = gridH - visualY - size.h;
        }

        if (targetX < 0 || visualY < 0 || targetX + size.w > gridW || visualY + size.h > gridH) {
            if (this.dragSource !== 'copy_mode') this.editor.renderer.renderGrid(); 
            return;
        }

        let collisionList = targetArray;
        if (this.dragSource === targetType && this.dragSource !== 'copy_mode') {
            collisionList = targetArray.filter((_, i) => i !== this.dragIndex);
        }

        for (let other of collisionList) {
            const oDef = this.editor.dataManager.definitions.relics[other._relicBaseDefinitionID];
            const oSize = this.editor.dataManager.getRelicSize(oDef);
            const overlap = !(targetX >= other._position.x + oSize.w || targetX + size.w <= other._position.x || finalDataY >= other._position.y + oSize.h || finalDataY + size.h <= other._position.y);
            if (overlap) { 
                if (this.dragSource !== 'copy_mode') this.editor.renderer.renderGrid(); 
                return; 
            }
        }

        if (!isStash) {
             for(let w = 0; w < size.w; w++) {
                 for(let h = 0; h < size.h; h++) {
                     const cx = targetX + w;
                     const cy = finalDataY + h;
                     const vRow = gridH - 1 - cy; 
                     if (!currentShape.shape[vRow * gridW + cx]) {
                         if (this.dragSource !== 'copy_mode') this.editor.renderer.renderGrid(); 
                         return; 
                     }
                 }
             }
        }

        if (this.dragSource !== 'copy_mode') {
            if (this.dragSource === 'main') {
                loadout.Items.splice(this.dragIndex, 1);
            } else if (this.dragSource === 'stash') {
                this.editor.dataManager.stashItems.splice(this.dragIndex, 1);
            }
        }

        this.dragItem._position.x = targetX;
        this.dragItem._position.y = finalDataY;

        if (targetType === 'main') {
            loadout.Items.push(this.dragItem);
        } else {
            this.editor.dataManager.stashItems.push(this.dragItem);
        }

        this.editor.selectedContainer = targetType;
        this.editor.selectedRelicIndex = (targetType === 'main' ? loadout.Items.length : this.editor.dataManager.stashItems.length) - 1;

        this.editor.renderer.renderGrid();
        this.editor.inspector.renderInspector();
    }

    undoLastDelete() {
        if (this.deletedItemHistory.length === 0) {
            console.log("Nothing to undo.");
            return;
        }

        const record = this.deletedItemHistory.pop();
        const item = record.item;
        
        let targetArray;
        const isStash = (record.source === 'stash');

        if (isStash) {
            targetArray = this.editor.dataManager.stashItems;
        } else {
            const loadout = this.editor.dataManager.data.save._relicLoadoutsSaveData._loadouts[this.editor.currentLoadoutIndex];
            targetArray = loadout.Items;
        }

        const def = this.editor.dataManager.definitions.relics[item._relicBaseDefinitionID];
        const size = this.editor.dataManager.getRelicSize(def);
        
        const isBlocked = targetArray.some(other => {
            const oDef = this.editor.dataManager.definitions.relics[other._relicBaseDefinitionID];
            const oSize = this.editor.dataManager.getRelicSize(oDef);
            
            return !(
                item._position.x >= other._position.x + oSize.w || 
                item._position.x + size.w <= other._position.x || 
                item._position.y >= other._position.y + oSize.h || 
                item._position.y + size.h <= other._position.y
            );
        });

        if (isBlocked) {
            alert("Cannot undo: The original slot is now occupied.");
            return;
        }

        targetArray.push(item);
        
        this.editor.selectedContainer = record.source;
        this.editor.selectedRelicIndex = targetArray.length - 1;

        this.editor.renderer.renderGrid();
        this.editor.inspector.renderInspector();
    }

    startCopy(e, originalItem) {
        if (this.isDragging) return;

        const clone = JSON.parse(JSON.stringify(originalItem));
        const def = this.editor.dataManager.definitions.relics[clone._relicBaseDefinitionID];
        const size = this.editor.dataManager.getRelicSize(def);
        
        const el = document.createElement('div');
        el.className = `relic-item rarity-${clone._eRelicRarity} dragging`;
        
        this.editor.renderer.renderRelicContent(el, def, clone._tier);
        
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

        this.initDrag(e, clone, -1, el, 'copy_mode');
        this.isDragging = true;
        
        const rect = el.getBoundingClientRect();
        this.dragOffsetX = e.clientX - rect.left;
        this.dragOffsetY = e.clientY - rect.top;
    }
}
