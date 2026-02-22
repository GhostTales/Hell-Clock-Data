import { getLevenshteinDistance, formatString } from './utils.js';

export class RelicModals {
    constructor(editor) {
        this.editor = editor;
        this.pendingAffixCallback = null;
        this.editingAffixId = null;
        this.activeAffixType = null;
        this.allAffixOptions = [];
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
        
        const dataManager = this.editor.dataManager;
        this.allAffixOptions = Object.values(dataManager.definitions.affixes).map(def => ({
            id: def.id,
            name: def.name ? formatString(def.name) : `ID: ${def.id}`,
            rawDef: def
        })).sort((a, b) => a.name.localeCompare(b.name));

        this.filterAffixes();
    }

    closeModal() {
        document.getElementById('affixModal').style.display = 'none';
        this.pendingAffixCallback = null;
    }

    onSpoilerToggle() {
        if (document.getElementById('affixModal').style.display === 'flex') {
            this.filterAffixes();
        }
        if (document.getElementById('creationModal').style.display === 'flex') {
            this.openCreationModal();
            this.filterCreationList();
        }
    }

    filterAffixes() {
        const rawQuery = document.getElementById('affixSearchInput').value.toLowerCase().trim();
        const filterType = document.getElementById('affixFilterSelect').value; 
        const hideSpoilers = document.getElementById('chk-hide-spoilers')?.checked;
        const dataManager = this.editor.dataManager;
        
        let allowedIds = []; 
        let itemHasType = false;      
        let itemHasCorrupted = false; 
        let currentRelicSize = null;

        if (this.editor.restrictSearch && this.activeAffixType && this.editor.selectedRelicIndex !== -1) {
             const item = this.editor.getSelectedItem();
             if (item) {
                 const rDef = dataManager.definitions.relics[item._relicBaseDefinitionID];
                 if (rDef) currentRelicSize = rDef.eRelicSize;
                 if (this.activeAffixType === 'implicit') {
                     const currentImplicits = item._implicitAffixesData || [];
                     currentImplicits.forEach(imp => {
                         const impId = imp._relicAffixData._relicAffixDefinitionId;
                         if (this.editingAffixId && String(impId) === String(this.editingAffixId)) return; 
                         const impCats = dataManager.getAffixCategory(impId);
                         if (impCats.some(c => c >= 0 && c <= 2)) itemHasType = true;
                         if (impCats.includes(3)) itemHasCorrupted = true;
                     });
                 } else if (this.activeAffixType === 'rare') {
                     allowedIds = []; 
                 } else {
                     const list = dataManager.getAllowedAffixIds(item._relicBaseDefinitionID, this.activeAffixType);
                     allowedIds = list || []; 
                 }
             }
        }

        const queryTokens = rawQuery.split(/[\s-]+/).filter(t => t.length > 0);

        const filtered = this.allAffixOptions.filter(opt => {
            const def = opt.rawDef;
            const name = opt.name.toLowerCase();
            const id = String(opt.id);

            if (hideSpoilers) {
                if (dataManager.nonDroppableAffixIds && dataManager.nonDroppableAffixIds.has(def.id)) {
                    return false;
                }

                const poolInfo = dataManager.affixPoolMap ? dataManager.affixPoolMap[def.id] : null;
                const isUnique = def.eAffixRarity === 'Unique';
                const isSpecial = def.eAffixRarity === 'Special';
                const cats = dataManager.getAffixCategory(def.id);

                if (!poolInfo && !isUnique && !isSpecial && cats.length === 0) return false;
            }

            if (def.eAffixRarity === 'Unique') return false;

            if (this.editor.restrictSearch && this.activeAffixType) {
                if (this.activeAffixType === 'implicit') {
                    if (currentRelicSize) {
                        const sizes = dataManager.getAffixSizes(def.id);
                        if (sizes.length > 0 && !sizes.includes(currentRelicSize)) return false;
                    }

                    const candCats = dataManager.getAffixCategory(def.id);
                    if (candCats.length === 0) return false;
                    const candHasType = candCats.some(c => c >= 0 && c <= 2);
                    const candHasCorrupted = candCats.includes(3);

                    if (itemHasType && candHasType) return false;
                    if (itemHasCorrupted && candHasCorrupted) return false;

                    if (this.editingAffixId) {
                        const srcCats = dataManager.getAffixCategory(this.editingAffixId);
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
                const candCats = dataManager.getAffixCategory(def.id);
                
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
        const dataManager = this.editor.dataManager;
        
        if (items.length === 0) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'padding: 20px; text-align: center; color: var(--text-muted); display: flex; flex-direction: column; gap: 10px; align-items: center;';

            if (this.editor.restrictSearch) {
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
                        this.editor.toggleSearchRestrictions(chk); 
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
            const poolInfo = dataManager.affixPoolMap ? dataManager.affixPoolMap[def.id] : null;
            if (poolInfo) {
                if (poolInfo.primary) tagsHtml += `<span class="tag-badge tag-primary">Primary</span>`;
                if (poolInfo.secondary) tagsHtml += `<span class="tag-badge tag-secondary">Secondary</span>`;
            }

            const isUnique = def.eAffixRarity === 'Unique';
            const isSpecial = def.eAffixRarity === 'Special';
            if (isUnique) tagsHtml += `<span class="tag-badge tag-unique">Unique</span>`;
            else if (isSpecial) tagsHtml += `<span class="tag-badge tag-rare">Rare</span>`;

            if (dataManager.nonDroppableAffixIds && dataManager.nonDroppableAffixIds.has(def.id)) {
                tagsHtml += `<span class="tag-badge tag-unavailable">Not Attainable</span>`;
            }

            const cats = dataManager.getAffixCategory(def.id);
            cats.forEach(catId => {
                if (catId === 3) return; 
                const catName = dataManager.getImplicitCategoryName(catId);
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
        const hideSpoilers = document.getElementById('chk-hide-spoilers')?.checked;
        const dataManager = this.editor.dataManager;

        if (!dataManager.data.relics || !dataManager.data.relics.Relics) {
            alert("Relic database not loaded yet.");
            return;
        }

        const filtered = dataManager.data.relics.Relics.filter(r => {
            if (r.name.includes("_Tier4")) return true;
            if (r.type === "UniqueRelicBaseDefinition") {
                if (hideSpoilers && r.canDrop === false) return false;
                return true;
            }
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

            const labelDiv = document.createElement('div');
            labelDiv.style.marginTop = "2px";
            labelDiv.style.display = "flex";
            labelDiv.style.gap = "6px";

            if (!relic.name.includes("_Tier4")) {
                const uniqueBadge = document.createElement('span');
                uniqueBadge.textContent = "UNIQUE";
                uniqueBadge.style.cssText = "color:#f85149; font-size:0.8em; border:1px solid #f85149; padding:0 4px; border-radius:4px;";
                labelDiv.appendChild(uniqueBadge);
            }

            if (relic.canDrop === false && relic.type === 'UniqueRelicBaseDefinition') {
                const naBadge = document.createElement('span');
                naBadge.textContent = "Not Attainable";
                naBadge.style.cssText = "color:#8b949e; font-size:0.8em; border:1px solid rgba(139, 148, 158, 0.4); background: rgba(110, 118, 129, 0.1); padding:0 4px; border-radius:4px; font-style: italic;";
                labelDiv.appendChild(naBadge);
            }

            if (labelDiv.hasChildNodes()) {
                leftCol.appendChild(labelDiv);
            }

            const btn = document.createElement('button');
            btn.className = "btn-add";
            btn.textContent = "Create";
            btn.style.cssText = "width:auto; padding:4px 12px; margin-left:10px;";
            btn.onclick = (e) => this.editor.createRelic(e, relic.id);

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
}
