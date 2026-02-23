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

    getAffixIconData(def) {
        if (!def) return { path: 'icons/UI_AffixBullet.png', color: null };
        
        const isRareOrUnique = def.eAffixRarity === 'Unique' || def.eAffixRarity === 'Special';
        
        if (isRareOrUnique) {
            if (def.customIcon) {
                return { path: `icons/${def.customIcon.endsWith('.png') ? def.customIcon : def.customIcon + '.png'}`, color: null };
            }
            if (def.name && def.name.includes(' - ')) {
                 let skillName = def.name.split(' - ')[0].replace(/^The\s+/i, '').replace(/[^a-zA-Z0-9]/g, '');
                 const skillNameMap = {
                     'VeilofQuills': 'HomingProjectiles',
                     'Matadeira': 'EnemyCannons',
                     'Bombardment': 'RainOfHeads',
                     'SummonMarksmen': 'PhantomMarksmen',
                     'Splitshot': 'SplitShot'
                 };
                 if (skillNameMap[skillName]) skillName = skillNameMap[skillName];
                 return { path: `icons/IconSkill_${skillName}.png`, color: null };
            }
        }
        
        const cats = this.editor.dataManager.getAffixCategory(def.id);
        if (cats.includes(3)) return { path: 'icons/UI_CorruptedBullet.png', color: '#a371f7' };
        if (cats.some(c => c >= 0 && c <= 2)) {
            let color = '#888888';
            if (cats.includes(0)) color = '#e5534b';
            else if (cats.includes(1)) color = '#58a6ff';
            else if (cats.includes(2)) color = '#3fb950';
            return { path: 'icons/UI_AffixBullet3.png', color: color };
        }
        
        return { path: 'icons/UI_AffixBullet.png', color: null };
    }

    getRelicIconPath(def, tier) {
        if (!def) return '';
        const dataManager = this.editor.dataManager;
        let spriteName = def.sprite;
        
        if (!spriteName && def.eRelicSize && dataManager.data.config && dataManager.data.config.relicTierConfigs) {
            const t = tier || 1;
            const tierConfig = dataManager.data.config.relicTierConfigs.find(c => c.tier === t);
            if (tierConfig && tierConfig.spritePerSize) {
                spriteName = tierConfig.spritePerSize[def.eRelicSize];
            }
        }
        
        if (!spriteName && def.eRelicSize) {
             spriteName = `IconRelic_${def.eRelicSize}${tier || 1}`;
        }

        if (spriteName) {
            if (spriteName.toLowerCase().endsWith('.png')) spriteName = spriteName.slice(0, -4);
            return `icons/${spriteName}.png`;
        }
        return '';
    }

    showChangelog(report) {
        const modal = document.getElementById('changelogModal');
        const container = document.getElementById('changelogContent');
        container.innerHTML = '';

        if (report.groups.length === 0) {
             const div = document.createElement('div');
             div.style.padding = '20px';
             div.style.textAlign = 'center';
             div.style.color = 'var(--text-muted)';
             div.textContent = "No edit history found.";
             container.appendChild(div);
             modal.style.display = 'flex';
             return;
        }

        report.groups.forEach(group => {
            // Group Header
            const groupHeader = document.createElement('div');
            groupHeader.style.cssText = 'background: var(--panel-bg); border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 10px; overflow: hidden;';
            
            // Header Content
            const headerTop = document.createElement('div');
            headerTop.className = 'changelog-group-header';
            headerTop.style.cssText = 'padding: 8px 12px; background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;';
            
            let relicName = "Unknown Item";
            let iconPath = '';
            
            let foundItem = null;
            if (group.loc === 0) { // Main Grid
                if (this.editor.dataManager.data.save && this.editor.dataManager.data.save._relicLoadoutsSaveData) {
                    const loadout = this.editor.dataManager.data.save._relicLoadoutsSaveData._loadouts[group.page];
                    if (loadout && loadout.Items) {
                        foundItem = loadout.Items.find(i => i._position.x === group.x && i._position.y === group.y);
                    }
                }
            } else { // Reliquary
                foundItem = this.editor.dataManager.reliquaryItems.find(i => 
                    i._pageIndex === group.page && 
                    i._position.x === group.x && 
                    i._position.y === group.y
                );
            }

            if (group.relicId !== null) {
                const def = this.editor.dataManager.definitions.relics[group.relicId];
                if (def) {
                    const tier = foundItem ? (foundItem._tier || 1) : 1;
                    relicName = this.editor.renderer.formatRelicDisplay(this.editor.dataManager.getRelicName(def, tier));
                    iconPath = this.getRelicIconPath(def, tier);
                } else {
                    relicName = `Relic #${group.relicId}`;
                }
            } else {
                if (foundItem) {
                    const def = this.editor.dataManager.definitions.relics[foundItem._relicBaseDefinitionID];
                    if (def) {
                        const tier = foundItem._tier || 1;
                        relicName = this.editor.renderer.formatRelicDisplay(this.editor.dataManager.getRelicName(def, tier));
                        iconPath = this.getRelicIconPath(def, tier);
                    }
                }
            }

            // Resolve StatChanged deltas to absolute values for display
            let currentStats = {
                tier: foundItem ? (foundItem._tier || 1) : 1,
                rarity: foundItem ? (foundItem._eRelicRarity || 0) : 0,
                level: foundItem ? (foundItem._upgradeLevel || 0) : 0,
                affixes: {}
            };
            
            if (foundItem && foundItem._affixesData) {
                foundItem._affixesData.forEach(a => {
                    currentStats.affixes[a._relicAffixDefinitionId] = a._rollValue;
                });
            }

            for (let i = group.edits.length - 1; i >= 0; i--) {
                const edit = group.edits[i];
                if (edit.action === 5) {
                    if (edit.changes) {
                        if (edit.changes.tier) currentStats.tier = edit.changes.tier.old;
                        if (edit.changes.rarity) currentStats.rarity = edit.changes.rarity.old;
                        if (edit.changes.level) currentStats.level = edit.changes.level.old;
                    } else if (edit.statDeltas) {
                        const inferred = {};
                        let hasChange = false;
                        if (edit.statDeltas.tier !== 0) {
                            inferred.tier = { new: currentStats.tier, old: currentStats.tier - edit.statDeltas.tier };
                            currentStats.tier = inferred.tier.old;
                            hasChange = true;
                        }
                        if (edit.statDeltas.rarity !== 0) {
                            inferred.rarity = { new: currentStats.rarity, old: currentStats.rarity - edit.statDeltas.rarity };
                            currentStats.rarity = inferred.rarity.old;
                            hasChange = true;
                        }
                        if (edit.statDeltas.level !== 0) {
                            inferred.level = { new: currentStats.level, old: currentStats.level - edit.statDeltas.level };
                            currentStats.level = inferred.level.old;
                            hasChange = true;
                        }
                        if (hasChange) edit._inferredChanges = inferred;
                    }
                } else if (edit.action === 4) { // RollChanged
                    if (edit.changes) {
                        if (edit.changes.old !== null) currentStats.affixes[edit.id] = edit.changes.old;
                    } else if (edit.rollDelta !== undefined) {
                        const currentVal = currentStats.affixes[edit.id] !== undefined ? currentStats.affixes[edit.id] : 0.5;
                        const oldVal = currentVal - edit.rollDelta;
                        edit._inferredChanges = { old: oldVal, new: currentVal };
                        currentStats.affixes[edit.id] = oldVal;
                    }
                }
            }

            const locStr = group.loc ? `Reliquary (Pg ${group.page + 1})` : `Loadout ${group.page + 1}`;
            const coords = `[${group.x}, ${group.y}]`;

            headerTop.innerHTML = `
                <div style="display:flex; align-items:center; gap: 10px;">
                    <span class="changelog-arrow" style="display:inline-block; width:12px; text-align:center; transition:transform 0.2s; color:var(--text-muted);">▼</span>
                    ${iconPath ? `<img src="${iconPath}" style="width:24px; height:24px; object-fit:contain;">` : ''}
                    <span style="font-weight:600; color:var(--text-color);">${relicName}</span>
                    <span style="color:var(--text-muted); font-size:0.8em; font-weight:normal;">(${group.edits.length})</span>
                </div>
                <div style="font-family:monospace; font-size:0.8em; color:var(--text-muted);">${locStr} ${coords}</div>
            `;
            groupHeader.appendChild(headerTop);

            // Edits List
            const editsList = document.createElement('div');
            
            group.edits.forEach(edit => {
                const row = document.createElement('div');
                row.className = 'changelog-entry';
                row.style.borderBottom = '1px solid rgba(48, 54, 61, 0.5)';
                row.style.padding = '6px 12px';
                
                let actionClass = 'action-default';
                let actionLabel = 'UNKNOWN';
                let iconHtml = '';
                
                switch(edit.action) {
                    case 0: actionClass = 'action-add'; actionLabel = 'ADDED'; break;
                    case 1: actionClass = 'action-remove'; actionLabel = 'REMOVED'; break;
                    case 2: actionClass = 'action-add'; actionLabel = 'AFFIX +'; break;
                    case 3: actionClass = 'action-remove'; actionLabel = 'AFFIX -'; break;
                    case 4: actionClass = 'action-modify'; actionLabel = 'ROLL'; break;
                    case 5: actionClass = 'action-modify'; actionLabel = 'STAT'; break;
                    case 6: actionClass = 'action-modify'; actionLabel = 'MOVED'; break;
                }

                let itemName = '';
                let subText = '';

                if (edit.action === 0 || edit.action === 1 || edit.action === 5 || edit.action === 6) {
                     // For relic actions, we already have the header, maybe just say "Properties Changed" or "Created"
                     if (edit.action === 0) itemName = "Item Created";
                     else if (edit.action === 1) itemName = "Item Removed";
                     else if (edit.action === 6) {
                         itemName = "Item Moved";
                         const dest = edit.newLoc === 1 ? "Reliquary" : "Main Grid";
                         subText = `To: ${dest} [${edit.newX}, ${edit.newY}]`;
                     }
                     else {
                         itemName = "Stats Modified";
                         const changes = edit.changes || edit._inferredChanges;
                         if (changes) {
                             let parts = [];
                             const rarityNames = ["Common", "Magic", "Rare", "Unique"];
                            if (changes.level) parts.push(`Lvl ${changes.level.old} -> ${changes.level.new}`);
                             if (changes.tier) parts.push(`Tier ${changes.tier.old} -> ${changes.tier.new}`);
                             if (changes.rarity) {
                                 const oldR = rarityNames[changes.rarity.old] || changes.rarity.old;
                                 const newR = rarityNames[changes.rarity.new] || changes.rarity.new;
                                 parts.push(`Rarity ${oldR} -> ${newR}`);
                             }
                             subText = parts.join(" • ");
                         } else if (edit.statDeltas) {
                             let parts = [];
                             if (edit.statDeltas.level !== 0) parts.push(`Lvl ${edit.statDeltas.level > 0 ? '+' : ''}${edit.statDeltas.level}`);
                             if (edit.statDeltas.tier !== 0) parts.push(`Tier ${edit.statDeltas.tier > 0 ? '+' : ''}${edit.statDeltas.tier}`);
                             if (edit.statDeltas.rarity !== 0) parts.push(`Rarity ${edit.statDeltas.rarity > 0 ? '+' : ''}${edit.statDeltas.rarity}`);
                             subText = parts.join(" • ");
                         }
                     }

                     // Show relic icon for context
                     const def = this.editor.dataManager.definitions.relics[edit.id];
                     if (def) {
                         const rIcon = this.getRelicIconPath(def, edit.tier);
                         iconHtml = `<img src="${rIcon}" onerror="this.style.display='none'">`;
                     }
                } else {
                     const def = this.editor.dataManager.definitions.affixes[edit.id];
                     itemName = def ? formatString(def.name) : `ID: ${edit.id}`;
                     if (edit.action === 4) {
                         const changes = edit.changes || edit._inferredChanges;
                         if (changes) {
                             subText = `${changes.old} -> ${changes.new}`;
                         } else {
                             subText = `Delta: ${edit.rollDelta}`; // Fallback
                         }
                     }
                     const iconData = this.getAffixIconData(def);
                     if (iconData.color) {
                         iconHtml = `<div style="width:100%; height:100%; background-color: ${iconData.color}; -webkit-mask-image: url('${iconData.path}'); mask-image: url('${iconData.path}'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></div>`;
                     } else {
                         iconHtml = `<img src="${iconData.path}" onerror="this.style.display='none'">`;
                     }
                }

                row.innerHTML = `
                    <div class="changelog-badge ${actionClass}" style="font-size:0.65em; min-width:50px;">${actionLabel}</div>
                    <div class="changelog-icon">${iconHtml}</div>
                    <div class="changelog-details" style="flex-direction:row; justify-content:flex-start; align-items:center; gap:10px;">
                        <div class="changelog-name" style="font-size:0.85em;">${itemName}</div>
                        ${subText ? `<div class="changelog-sub" style="margin:0;">(${subText})</div>` : ''}
                    </div>
                `;
                editsList.appendChild(row);
            });
            
            // Toggle Logic
            headerTop.onclick = () => {
                const isHidden = editsList.style.display === 'none';
                editsList.style.display = isHidden ? 'block' : 'none';
                const arrow = headerTop.querySelector('.changelog-arrow');
                if (arrow) arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
                headerTop.style.borderBottom = isHidden ? '1px solid var(--border-color)' : 'none';
            };

            groupHeader.appendChild(editsList);
            container.appendChild(groupHeader);
        });

        modal.style.display = 'flex';
    }

    closeChangelogModal() {
        document.getElementById('changelogModal').style.display = 'none';
    }
}
