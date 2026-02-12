import { RelicDataManager } from './relic-data-manager.js';
import { RelicRenderer } from './relic-renderer.js';
import { RelicInspector } from './relic-inspector.js';
import { RelicModals } from './relic-modals.js';
import { TooltipManager } from './tooltip-manager.js';
import { DragManager } from './drag-manager.js';

class RelicEditor {
    constructor() {
        this.dataManager = new RelicDataManager(this);
        this.renderer = new RelicRenderer(this);
        this.inspector = new RelicInspector(this);
        this.modals = new RelicModals(this);
        this.tooltipManager = new TooltipManager(this);
        this.dragManager = new DragManager(this);
        
        this.currentLoadoutIndex = 0;
        this.reliquaryPage = 0;
        this.selectedRelicIndex = -1;
        this.selectedContainer = 'main'; // 'main' or 'stash'
        
        this.restrictAffixes = false;
        this.restrictSearch = false;
        this.ui_unlockLimits = false;

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                e.preventDefault();
                this.dragManager.undoLastDelete();
            }
        });

        this.dataManager.initAutoLoad();
    }

    renderGrid() {
        this.renderer.renderGrid();
    }

    renderReliquary() {
        this.renderer.renderReliquary();
    }

    prevReliquaryPage() {
        if (this.reliquaryPage > 0) {
            this.reliquaryPage--;
            this.renderReliquary();
        }
    }

    nextReliquaryPage() {
        this.reliquaryPage++;
        this.renderReliquary();
    }

    renderInspector() {
        this.inspector.renderInspector();
    }

    loadSaveFile(input) {
        this.dataManager.loadSaveFile(input);
    }

    downloadSave() {
        this.dataManager.downloadSave();
    }

    filterAffixes() {
        this.modals.filterAffixes();
    }

    closeModal() {
        this.modals.closeModal();
    }

    openCreationModal() {
        this.modals.openCreationModal();
    }

    closeCreationModal() {
        this.modals.closeCreationModal();
    }

    filterCreationList() {
        this.modals.filterCreationList();
    }

    enableSaveUpload() {
        const input = document.getElementById('inp-save');
        const lbl = document.getElementById('lbl-save');
        if(input && lbl) {
            input.disabled = false;
            lbl.classList.remove('disabled');
        }
    }

    initEditorUI() {
        const saveData = this.dataManager.data.save._relicLoadoutsSaveData;
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
        this.renderer.renderGrid();
    }

    switchLoadout() {
        const select = document.getElementById('loadoutSelect');
        this.currentLoadoutIndex = parseInt(select.value);
        this.selectedRelicIndex = -1;
        this.renderer.renderGrid();
        this.inspector.renderInspector();
    }

    updateGridSettings(size) {
        document.documentElement.style.setProperty('--grid-cell-size', size + 'px');
        const display = document.getElementById('cellSizeDisplay');
        if (display) display.textContent = size + 'px';
        this.renderer.renderGrid();
    }

    toggleLimitUnlock(isChecked) {
        this.ui_unlockLimits = isChecked;
        this.inspector.renderInspector();
    }

    getSelectedItem() {
        if (this.selectedRelicIndex === -1) return null;
        if (this.selectedContainer === 'reliquary') return this.dataManager.reliquaryItems[this.selectedRelicIndex];
        if (this.currentLoadoutIndex !== -1 && this.dataManager.data.save) {
            const loadout = this.dataManager.data.save._relicLoadoutsSaveData._loadouts[this.currentLoadoutIndex];
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

            let category = 0;
            if (idToUse !== 0) {
                const cats = this.dataManager.getAffixCategory(idToUse);
                if (cats.length > 0) category = cats[0];
            }
            item._implicitAffixesData.push({ _relicAffixData: newAffix, _eImplicitAffixCategory: category });
        } else {
            if (!item._affixesData) item._affixesData = [];
            item._affixesData.push(newAffix);
        }
        this.inspector.renderInspector();
    }

    removeAffix(index, isImplicit) {
        const item = this.getSelectedItem();
        if (!item) return;
        if (isImplicit && item._implicitAffixesData) {
            item._implicitAffixesData.splice(index, 1);
        } else if (!isImplicit && item._affixesData) {
            item._affixesData.splice(index, 1);
        }
        this.inspector.renderInspector();
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
        this.inspector.renderInspector();
    }

    toggleRestrictions(checkbox) {
        this.restrictAffixes = checkbox.checked;
        this.inspector.renderInspector(); 
    }

    toggleSearchRestrictions(checkbox) {
        this.restrictSearch = checkbox.checked;
        const modal = document.getElementById('affixModal');
        if (modal && modal.style.display !== 'none') {
            this.modals.filterAffixes();
        }
    }

    createRelic(e, relicDefId) {
        this.modals.closeCreationModal();
        const def = this.dataManager.definitions.relics[relicDefId];
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

        const size = this.dataManager.getRelicSize(def);
        const el = document.createElement('div');
        el.className = `relic-item rarity-${newRelic._eRelicRarity} dragging`;
        this.renderer.renderRelicContent(el, def, newRelic._tier);
        
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
}

window.app = new RelicEditor();
