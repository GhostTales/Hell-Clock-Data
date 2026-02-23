// c:\MasterFolder\Programming\Hell-Clock-Data\js\changelog-manager.js
export class ChangelogManager {
    constructor(editor) {
        this.editor = editor;
        this.edits = [];
        this.appliedWatermarks = [];
    }

    registerEdit(item, action, details = {}) {
        // item: The relic object being edited
        // action: "RelicAdded", "RelicRemoved", "AffixAdded", "AffixRemoved", "RollChanged", "StatChanged"
        // details: { id (affixId), rollUp (bool) }
        if (!this.edits) this.edits = [];
        
        // Clone item state to preserve position/page at time of edit
        const itemSnapshot = {
            _relicBaseDefinitionID: item._relicBaseDefinitionID,
            _position: { ...item._position },
            _pageIndex: item._pageIndex,
            _tier: item._tier,
            _eRelicRarity: item._eRelicRarity,
            _upgradeLevel: item._upgradeLevel,
            _loadoutIndex: (item._pageIndex === undefined || item._pageIndex === null) ? this.editor.currentLoadoutIndex : undefined
        };

        // Optimization: Remove redundant previous edits for the same target to save space and keep history clean
            for (let i = this.edits.length - 1; i >= 0; i--) {
                const prev = this.edits[i];
                
                // Must match location and item type
                const sameTarget = (
                    prev.item._position.x === itemSnapshot._position.x &&
                    prev.item._position.y === itemSnapshot._position.y &&
                    prev.item._pageIndex === itemSnapshot._pageIndex &&
                    prev.item._loadoutIndex === itemSnapshot._loadoutIndex &&
                    prev.item._relicBaseDefinitionID === itemSnapshot._relicBaseDefinitionID
                );

                if (!sameTarget) continue;

                if (action === "RollChanged" && prev.action === "RollChanged") {
                    // For rolls, must match the affix ID
                    if (prev.details && prev.details.id === details.id) {
                        // Preserve the original 'old' value from the previous edit
                        if (prev.details.changes && details.changes) {
                            details.changes.old = prev.details.changes.old;
                        }
                        this.edits.splice(i, 1);
                        break;
                    }
                } else if (action === "StatChanged") {
                    if (prev.action === "StatChanged") {
                        // Merge changes
                        if (details.changes) {
                            if (!prev.details.changes) prev.details.changes = {};
                            for (const key in details.changes) {
                                if (prev.details.changes[key]) {
                                    prev.details.changes[key].new = details.changes[key].new;
                                    if (prev.details.changes[key].old === prev.details.changes[key].new) {
                                        delete prev.details.changes[key];
                                    }
                                } else {
                                    prev.details.changes[key] = details.changes[key];
                                }
                            }
                        }
                        prev.item = itemSnapshot;
                        prev.timestamp = Date.now();
                        return; 
                    } else if (prev.action === "RelicAdded") {
                        // Merge stat changes into the creation event
                        prev.item = itemSnapshot;
                        prev.timestamp = Date.now();
                        return; // Don't add a new entry
                    }
                } else if (action === "RelicAdded") {
                    
                } else if (action === "AffixRemoved") {
                    // If we are removing an affix we just added, cancel both out
                    if (prev.action === "AffixAdded" && prev.details && prev.details.id === details.id) {
                        this.edits.splice(i, 1);
                        return; // Don't add the Remove event
                    }
                    // Also remove any intermediate roll changes for this affix if we are removing it
                    if (prev.action === "RollChanged" && prev.details && prev.details.id === details.id) {
                        this.edits.splice(i, 1);
                        // Continue searching backwards to potentially find the Add event
                        continue;
                    }
                } else if (action === "AffixAdded" && prev.action === "AffixRemoved") {
                    // If we are adding back an affix we just removed, cancel both out (Undo effect)
                    if (prev.details && prev.details.id === details.id) {
                        this.edits.splice(i, 1);
                        return; // Don't add the Add event
                    }
                }
            }

        this.edits.push({
            item: itemSnapshot,
            action: action,
            details: details,
            timestamp: Date.now()
        });

        // Capture roll value for RollChanged
        if (action === "RollChanged") {
            const affix = item._affixesData ? item._affixesData.find(a => a._relicAffixDefinitionId === details.id) : null;
            const currentVal = affix ? affix._rollValue : 0.5;
            
            if (!details.changes) {
                details.changes = { new: currentVal, old: currentVal }; // Fallback if not provided
            }
            details.rollValue = details.changes.new;
        }

        // Since RelicAdded now only stores ID, we must immediately record its stats
        // so the changelog knows the Tier/Rarity/Level.
        if (action === "RelicAdded") {
            this.registerEdit(item, "StatChanged", { id: item._relicBaseDefinitionID });
        }
    }

    encodeEditData(edit) {
        const item = edit.item;
        const isReliquary = (item._pageIndex !== undefined && item._pageIndex !== null);
        const loc = isReliquary ? 1 : 0;
        const x = item._position ? item._position.x : 0;
        const y = item._position ? item._position.y : 0;
        // Use Page for Reliquary, Loadout Index for Main
        const page = isReliquary ? (item._pageIndex || 0) : (item._loadoutIndex || 0);
        
        let actionCode = 0;
        let payload = 0;

        // Helper to pack signed value
        const packSigned = (val, bits) => {
            const max = (1 << (bits - 1)) - 1;
            let mag = Math.abs(val);
            if (mag > max) mag = max; 
            const sign = val < 0 ? 1 : 0;
            return (sign << (bits - 1)) | mag;
        };

        // Helper to pack Stat Deltas: Level(4) | Rarity(3) | Tier(3) = 10 bits
        const packStatDeltas = (changes) => {
            let dTier = 0, dRarity = 0, dLevel = 0;
            if (changes) {
                if (changes.tier) dTier = changes.tier.new - changes.tier.old;
                if (changes.rarity) dRarity = changes.rarity.new - changes.rarity.old;
                if (changes.level) dLevel = changes.level.new - changes.level.old;
            }
            
            const pTier = packSigned(dTier, 3);
            const pRarity = packSigned(dRarity, 3);
            const pLevel = packSigned(dLevel, 4);
            
            return pTier | (pRarity << 3) | (pLevel << 6);
        };

        switch(edit.action) {
            case "RelicAdded": actionCode = 0; payload = item._relicBaseDefinitionID & 0x3FF; break;
            case "RelicRemoved": actionCode = 1; payload = item._relicBaseDefinitionID & 0x3FF; break;
            case "AffixAdded": actionCode = 2; payload = edit.details.id & 0x3FF; break; // 10 bits for Affix ID
            case "AffixRemoved": actionCode = 3; payload = edit.details.id & 0x3FF; break;
            case "RollChanged": 
                actionCode = 4; 
                // Calculate Delta
                let delta = 0;
                if (edit.details.changes) {
                    delta = edit.details.changes.new - edit.details.changes.old;
                }
                // RollChanged uses 2 slots. We return a special object to applyWatermarks.
                let baseEncoded = 0;
                baseEncoded |= (1 << 31); // Watermark
                baseEncoded |= (loc & 1) << 30;
                if (loc === 0) baseEncoded |= (page & 0x3) << 28;
                else baseEncoded |= (page & 0x7F) << 21;
                baseEncoded |= (actionCode & 0xF) << 17;
                baseEncoded |= (y & 0xF) << 13;
                baseEncoded |= (x & 0x7) << 10;
                // Payload (10 bits) will be filled with AffixID in applyWatermarks. rollValue holds the Delta.
                return { isDouble: true, baseEncoded, rollValue: delta, affixId: edit.details.id };
            case "StatChanged": actionCode = 5; payload = packStatDeltas(edit.details.changes); break;
            default: actionCode = 7; break;
        }

        // Bit Packing (32 bits total)
        // Bit 31: Watermark (1)
        // Bit 30: Location (1)
        // Bits 28-29: Loadout (2) -- Only if Loc=0
        // Bits 21-27: Page (7)    -- Only if Loc=1
        // Bits 17-20: Action (4)
        // Bits 13-16: Y (4)
        // Bits 10-12: X (3)
        // Bits 0-9: Payload (10)

        let encoded = 0;
        encoded |= (1 << 31); // Watermark
        encoded |= (loc & 1) << 30;
        
        if (loc === 0) {
            encoded |= (page & 0x3) << 28; // Loadout (2 bits)
        } else {
            encoded |= (page & 0x7F) << 21; // Page (7 bits)
        }

        encoded |= (actionCode & 0xF) << 17;
        encoded |= (y & 0xF) << 13;
        encoded |= (x & 0x7) << 10;
        encoded |= (payload & 0x3FF);

        return encoded;
    }

    decodeEditData(val) {
        // Extract fields
        const loc = (val >>> 30) & 1;
        let page, action, y, x, payload;

        if (loc === 0) {
            page = (val >>> 28) & 0x3;
        } else {
            page = (val >>> 21) & 0x7F;
        }

        action = (val >>> 17) & 0xF;
        y = (val >>> 13) & 0xF;
        x = (val >>> 10) & 0x7;
        payload = val & 0x3FF;

        // Helper to unpack signed value
        const unpackSigned = (val, totalBits) => {
            const magBits = totalBits - 1;
            const sign = (val >> magBits) & 1;
            const mag = val & ((1 << magBits) - 1);
            return sign ? -mag : mag;
        };

        // Decode Payload based on Action
        let id = 0;
        let tier = null;
        let rarity = null;
        let level = null;
        let rollDelta = 0;
        let statDeltas = null;

        if (action === 0 || action === 1) {
             // Relic Added/Removed
             id = payload;
        } else if (action === 2 || action === 3) {
             // Affix Added/Removed
             id = payload & 0x3FF; // Affix ID
        } else if (action === 4) {
             // Roll Changed
             id = payload & 0x3FF; // Affix ID
        } else if (action === 5) {
             // Stat Changed
             statDeltas = {
                 tier: unpackSigned(payload & 0x7, 3),
                 rarity: unpackSigned((payload >>> 3) & 0x7, 3),
                 level: unpackSigned((payload >>> 6) & 0xF, 4)
             };
        }
        
        return { action, loc, page, x, y, id, rollDelta, tier, rarity, level, statDeltas };
    }

    applyWatermarks(saveData) {
        const isLive = this.editor.dataManager.data && this.editor.dataManager.data.save === saveData;

        // Revert previously applied watermarks to prevent duplication
        if (this.appliedWatermarks && this.appliedWatermarks.length > 0) {
            this.appliedWatermarks.forEach(entry => {
                if (saveData.pastRunsData && saveData.pastRunsData[entry.runIndex]) {
                    const counters = saveData.pastRunsData[entry.runIndex]._statCounters;
                    if (counters) {
                        this.writeToCounters(counters, entry.key, entry.originalValue);
                    }
                }
            });
            if (isLive) {
                this.appliedWatermarks = [];
            }
        }

        // Encode edits into past runs using valid integer stat keys
        if (this.edits && this.edits.length > 0 && saveData.pastRunsData && saveData.pastRunsData.length > 0) {
            const runs = saveData.pastRunsData;
            let runIndex = 0;
            let keyIndex = 0;
            // Excludes TotalDeaths and DeathsInDungeon to avoid invalidating hardcore runs
            const validStatKeys = [
                "LevelAchieved", "EnemiesDefeated", "RegularEnemiesDefeated", "EliteEnemiesDefeated",
                "SoulStonesCollected", "UniqueEnemiesDefeated", "ChampionEnemiesDefeated", "BossEnemiesDefeated",
                "TotalRuns", "RunsPerDungeon", "RunsToCompleteDungeonForTheFirstTime"
            ];
            
            this.edits.forEach((edit, i) => {
                const encoded = this.encodeEditData(edit);
                const isDouble = encoded.isDouble;
                
                let placed = false;
                let attempts = 0;
                // Prevent infinite loop if we somehow fill every slot in every run (unlikely but safe)
                const maxAttempts = runs.length * validStatKeys.length + 10;

                while (!placed && attempts < maxAttempts) {
                    const targetRun = runs[runIndex];
                    if (!targetRun._statCounters) targetRun._statCounters = { _serializedList: [] };
                    const counters = targetRun._statCounters;

                    if (keyIndex < validStatKeys.length) {
                        const targetKey = validStatKeys[keyIndex];

                        // Check if this slot is already occupied by a watermark
                        let existingVal = 0;
                        let hasVal = false;
                        
                        if (counters._serializedList && Array.isArray(counters._serializedList)) {
                            const entry = counters._serializedList.find(e => e.Key === targetKey);
                            if (entry) { existingVal = entry.Value; hasVal = true; }
                        } else if (Array.isArray(counters.keys) && Array.isArray(counters.values)) {
                            const idx = counters.keys.indexOf(targetKey);
                            if (idx >= 0) { existingVal = counters.values[idx]; hasVal = true; }
                        } else if (Array.isArray(counters._keys) && Array.isArray(counters._values)) {
                            const idx = counters._keys.indexOf(targetKey);
                            if (idx >= 0) { existingVal = counters._values[idx]; hasVal = true; }
                        } else {
                            if (counters[targetKey] !== undefined) { existingVal = counters[targetKey]; hasVal = true; }
                        }

                        if (hasVal && typeof existingVal === 'number' && (existingVal & (1 << 31)) !== 0) {
                            // Slot occupied by watermark, skip it
                            keyIndex++;
                            attempts++;
                            continue;
                        }

                        // If this is a double-slot edit (RollChanged)
                        if (isDouble) {
                            // Current slot (Header) is free. Check next slot for Data.
                            let nextRunIndex = runIndex;
                            let nextKeyIndex = keyIndex + 1;
                            if (nextKeyIndex >= validStatKeys.length) {
                                nextKeyIndex = 0;
                                nextRunIndex++;
                                if (nextRunIndex >= runs.length) nextRunIndex = 0;
                            }

                            // Check next slot
                            const nextRun = runs[nextRunIndex];
                            if (!nextRun._statCounters) nextRun._statCounters = { _serializedList: [] };
                            const nextCounters = nextRun._statCounters;
                            const nextKey = validStatKeys[nextKeyIndex];
                            
                            let nextVal = 0;
                            let nextHasVal = false;
                            
                            if (nextCounters._serializedList && Array.isArray(nextCounters._serializedList)) {
                                const entry = nextCounters._serializedList.find(e => e.Key === nextKey);
                                if (entry) { nextVal = entry.Value; nextHasVal = true; }
                            } else if (Array.isArray(nextCounters.keys) && Array.isArray(nextCounters.values)) {
                                const idx = nextCounters.keys.indexOf(nextKey);
                                if (idx >= 0) { nextVal = nextCounters.values[idx]; nextHasVal = true; }
                            } else if (Array.isArray(nextCounters._keys) && Array.isArray(nextCounters._values)) {
                                const idx = nextCounters._keys.indexOf(nextKey);
                                if (idx >= 0) { nextVal = nextCounters._values[idx]; nextHasVal = true; }
                            } else {
                                if (nextCounters[nextKey] !== undefined) { nextVal = nextCounters[nextKey]; nextHasVal = true; }
                            }

                            if (nextHasVal && typeof nextVal === 'number' && (nextVal & (1 << 31)) !== 0) {
                                // Next slot occupied. Can't place double here.
                                // Skip current slot and try again
                                keyIndex++;
                                attempts++;
                                continue;
                            }

                            // Both free. Write.
                            
                            if (isLive) {
                                this.appliedWatermarks.push({
                                    runIndex: nextRunIndex,
                                    key: nextKey,
                                    originalValue: nextVal
                                });

                                this.appliedWatermarks.push({
                                    runIndex: runIndex,
                                    key: targetKey,
                                    originalValue: existingVal
                                });
                            }

                            // 1. Write Data (Roll Value)
                            const floatView = new Float32Array(1);
                            const intView = new Int32Array(floatView.buffer);
                            floatView[0] = -Math.abs(encoded.rollValue);
                            const dataVal = intView[0];
                            this.writeToCounters(nextCounters, nextKey, dataVal);

                            // 2. Write Header (with Affix ID)
                            const headerVal = encoded.baseEncoded | (encoded.affixId & 0x3FF);
                            this.writeToCounters(counters, targetKey, headerVal);

                            placed = true;

                            // Advance indices to after the data slot
                            runIndex = nextRunIndex;
                            keyIndex = nextKeyIndex;
                            // The loop increments keyIndex at the end, so we don't need to increment here
                            // unless we want to skip the data slot in the next iteration check.
                            // Actually, we should increment keyIndex so the loop's increment moves us to the slot AFTER data.
                        } else {
                            if (isLive) {
                                this.appliedWatermarks.push({
                                    runIndex: runIndex,
                                    key: targetKey,
                                    originalValue: existingVal
                                });
                            }

                            // Single slot edit
                            this.writeToCounters(counters, targetKey, encoded);
                            placed = true;
                        }

                        keyIndex++;
                    } else {
                        keyIndex = 0;
                        runIndex++;
                        if (runIndex >= runs.length) runIndex = 0; // Wrap around to oldest run
                    }
                    attempts++;
                }
            });
        }
    }

    writeToCounters(counters, key, val) {
        if (counters._serializedList && Array.isArray(counters._serializedList)) {
            const existing = counters._serializedList.find(e => e.Key === key);
            if (existing) existing.Value = val;
            else counters._serializedList.push({ Key: key, Value: val });
        } else if (Array.isArray(counters.keys) && Array.isArray(counters.values)) {
            const idx = counters.keys.indexOf(key);
            if (idx >= 0) counters.values[idx] = val;
            else { counters.keys.push(key); counters.values.push(val); }
        } else if (Array.isArray(counters._keys) && Array.isArray(counters._values)) {
            const idx = counters._keys.indexOf(key);
            if (idx >= 0) counters._values[idx] = val;
            else { counters._keys.push(key); counters._values.push(val); }
        } else {
            counters[key] = val;
        }
    }

    getItem(loc, page, x, y) {
        const data = this.editor.dataManager.data;
        if (!data || !data.save) return null;
        
        if (loc === 0) { // Loadout
            const loadouts = data.save._relicLoadoutsSaveData;
            if (loadouts && loadouts[page]) {
                return loadouts[page].Relics.find(r => r._position.x === x && r._position.y === y);
            }
        } else { // Reliquary
            // Try helper list first if available, otherwise check save structure
            const items = this.editor.dataManager.reliquaryItems || (data.save._reliquarySaveData ? data.save._reliquarySaveData.Relics : []);
            return items.find(r => r._pageIndex === page && r._position.x === x && r._position.y === y);
        }
        return null;
    }

    scanForEdits() {
        const saveData = this.editor.dataManager.data.save;
        
        let rawEntries = []; // { runIndex, keyIndex, val }
        const validStatKeys = [
            "LevelAchieved", "EnemiesDefeated", "RegularEnemiesDefeated", "EliteEnemiesDefeated",
            "SoulStonesCollected", "UniqueEnemiesDefeated", "ChampionEnemiesDefeated", "BossEnemiesDefeated",
            "TotalRuns", "RunsPerDungeon", "RunsToCompleteDungeonForTheFirstTime"
        ];

        // Helper to get value from specific run/key index
        const getValueAt = (rIdx, kIdx) => {
            if (rIdx < 0 || rIdx >= saveData.pastRunsData.length) return undefined;
            const run = saveData.pastRunsData[rIdx];
            if (!run._statCounters) return undefined;
            const key = validStatKeys[kIdx];
            const counters = run._statCounters;
            
            if (counters._serializedList && Array.isArray(counters._serializedList)) {
                const entry = counters._serializedList.find(e => e.Key === key);
                return entry ? entry.Value : undefined;
            } else if (Array.isArray(counters.keys) && Array.isArray(counters.values)) {
                const idx = counters.keys.indexOf(key);
                return idx >= 0 ? counters.values[idx] : undefined;
            } else if (Array.isArray(counters._keys) && Array.isArray(counters._values)) {
                const idx = counters._keys.indexOf(key);
                return idx >= 0 ? counters._values[idx] : undefined;
            } else {
                return counters[key];
            }
        };

        // 1. Extract from Save History
        if (saveData && saveData.pastRunsData) {
            saveData.pastRunsData.forEach((run, rIdx) => {
                if (!run._statCounters) return;
                const counters = run._statCounters;

                // Helper to get value by key
                const getValue = (k) => {
                    if (counters._serializedList && Array.isArray(counters._serializedList)) {
                        const entry = counters._serializedList.find(e => e.Key === k);
                        return entry ? entry.Value : undefined;
                    } else if (Array.isArray(counters.keys) && Array.isArray(counters.values)) {
                        const idx = counters.keys.indexOf(k);
                        return idx >= 0 ? counters.values[idx] : undefined;
                    } else if (Array.isArray(counters._keys) && Array.isArray(counters._values)) {
                        const idx = counters._keys.indexOf(k);
                        return idx >= 0 ? counters._values[idx] : undefined;
                    } else {
                        return counters[k];
                    }
                };

                validStatKeys.forEach((key, kIdx) => {
                    // Filter out watermarks applied in this session to prevent duplication
                    if (this.appliedWatermarks && this.appliedWatermarks.some(w => w.runIndex === rIdx && w.key === key)) {
                        return;
                    }

                    const val = getValue(key);
                    if (typeof val === 'number' && (val & (1 << 31)) !== 0) {
                        rawEntries.push({ runIndex: rIdx, keyIndex: kIdx, val: val });
                    }
                });
            });
        }

        let allDecodedEdits = [];

        for (let i = 0; i < rawEntries.length; i++) {
            const entry = rawEntries[i];
            const decoded = this.decodeEditData(entry.val);
            
            // Filter out potential floats that look like actions 6 or 7 (which are likely data slots)
            if (decoded.action >= 6) continue; 

            if (decoded.action === 4) { // RollChanged
                // The next slot might NOT be in rawEntries if it's a positive float (not a watermark)
                // We must calculate where it is in the save data.
                let nextRunIndex = entry.runIndex;
                let nextKeyIndex = entry.keyIndex + 1;
                if (nextKeyIndex >= validStatKeys.length) {
                    nextKeyIndex = 0;
                    nextRunIndex++;
                    if (nextRunIndex >= saveData.pastRunsData.length) nextRunIndex = 0;
                }

                const dataVal = getValueAt(nextRunIndex, nextKeyIndex);
                if (dataVal !== undefined) {
                    const floatView = new Float32Array(new Int32Array([dataVal]).buffer);
                    decoded.rollDelta = floatView[0]; // Signed delta
                    allDecodedEdits.push(decoded);
                    
                    // If the data slot WAS in rawEntries (because it happened to be negative), skip it
                    if (i + 1 < rawEntries.length) {
                        const nextEntry = rawEntries[i + 1];
                        if (nextEntry.runIndex === nextRunIndex && nextEntry.keyIndex === nextKeyIndex) {
                            i++;
                        }
                    }
                }
            } else {
                allDecodedEdits.push(decoded);
            }
        }

        // 2. Extract from Current Session
        if (this.edits && this.edits.length > 0) {
            this.edits.forEach(edit => {
                // For current session, we have the raw data, no need to decode pointers
                // But to keep format consistent, we can just use the edit object directly
                // or mock the decoded structure.
                // Let's mock it to match decodeEditData output
                const item = edit.item;
                const isReliquary = (item._pageIndex !== undefined && item._pageIndex !== null);
                const loc = isReliquary ? 1 : 0;
                const page = isReliquary ? (item._pageIndex || 0) : (item._loadoutIndex || 0);
                
                let actionCode = 7;
                if (edit.action === "RelicAdded") actionCode = 0;
                else if (edit.action === "RelicRemoved") actionCode = 1;
                else if (edit.action === "AffixAdded") actionCode = 2;
                else if (edit.action === "AffixRemoved") actionCode = 3;
                else if (edit.action === "RollChanged") actionCode = 4;
                else if (edit.action === "StatChanged") actionCode = 5;

                const decoded = {
                    action: actionCode,
                    loc: loc,
                    page: page,
                    x: item._position.x,
                    y: item._position.y,
                    id: (actionCode === 0 || actionCode === 1) ? item._relicBaseDefinitionID : (edit.details.id || 0),
                    tier: item._tier,
                    rarity: item._eRelicRarity,
                    level: item._upgradeLevel,
                    rollDelta: (edit.details.changes) ? (edit.details.changes.new - edit.details.changes.old) : 0,
                    changes: edit.details.changes
                };
                allDecodedEdits.push(decoded);
            });
        }

        if (allDecodedEdits.length === 0) {
            return { groups: [] };
        }

        // 3. Group by Relic (Location)
        const groups = [];
        let currentGroup = null;

        allDecodedEdits.forEach(edit => {
            // Check if matches current group
            if (currentGroup && 
                currentGroup.loc === edit.loc && 
                currentGroup.page === edit.page &&
                currentGroup.x === edit.x && 
                currentGroup.y === edit.y) {
                
                currentGroup.edits.push(edit);
                
                // Update group info if we find better data (e.g. Relic ID)
                if (edit.action === 0 || edit.action === 1) {
                    currentGroup.relicId = edit.id;
                }
            } else {
                // Start new group
                currentGroup = {
                    loc: edit.loc,
                    page: edit.page,
                    x: edit.x,
                    y: edit.y,
                    relicId: (edit.action === 0 || edit.action === 1) ? edit.id : null,
                    edits: [edit]
                };
                groups.push(currentGroup);
            }
        });

        // Reverse groups to show newest first
        groups.reverse();

        // Resolve StatChanged deltas using current save file state
        const itemStates = {};

        groups.forEach(group => {
            const key = `${group.loc}-${group.page}-${group.x}-${group.y}`;
            
            // Initialize state from current save file
            if (itemStates[key] === undefined) {
                const item = this.getItem(group.loc, group.page, group.x, group.y);
                if (item) {
                    itemStates[key] = {
                        tier: item._tier || 1,
                        rarity: item._eRelicRarity || 0,
                        level: item._upgradeLevel || 0,
                        affixes: {}
                    };
                    // Populate initial affix rolls
                    if (item && item._affixesData) {
                        item._affixesData.forEach(a => {
                            itemStates[key].affixes[a._relicAffixDefinitionId] = a._rollValue;
                        });
                    }
                } else {
                    itemStates[key] = null;
                }
            }

            // Iterate backwards (Newest -> Oldest) to infer previous values
            for (let i = group.edits.length - 1; i >= 0; i--) {
                const edit = group.edits[i];
                const state = itemStates[key];

                if (edit.action === 0) { // RelicAdded
                    itemStates[key] = null; // Reset state as item didn't exist before this
                    continue;
                }

                if (!state) continue;

                if (edit.action === 5) { // StatChanged
                    if (edit.changes) {
                        // If we already have absolute changes (current session), update running state
                        if (edit.changes.tier) state.tier = edit.changes.tier.old;
                        if (edit.changes.rarity) state.rarity = edit.changes.rarity.old;
                        if (edit.changes.level) state.level = edit.changes.level.old;
                    } else if (edit.statDeltas) {
                        // If we only have deltas (past runs), infer old values
                        const changes = {};
                        const d = edit.statDeltas;
                        let hasChange = false;

                        const applyDelta = (prop, delta) => {
                            if (delta !== 0) {
                                const newVal = state[prop];
                                const oldVal = newVal - delta;
                                changes[prop] = { old: oldVal, new: newVal };
                                state[prop] = oldVal;
                                hasChange = true;
                            }
                        };

                        applyDelta('level', d.level);
                        applyDelta('tier', d.tier);
                        applyDelta('rarity', d.rarity);

                        if (hasChange) {
                            edit.changes = changes;
                        }
                    }
                } else if (edit.action === 4) { // RollChanged
                    if (edit.changes) {
                        // Current session
                        if (edit.changes.old !== null) {
                            state.affixes[edit.id] = edit.changes.old;
                        }
                    } else if (edit.rollDelta !== undefined) {
                        // Past runs
                        const currentVal = state.affixes[edit.id] !== undefined ? state.affixes[edit.id] : 0.5;
                        const oldVal = currentVal - edit.rollDelta;
                        
                        edit.changes = { old: oldVal, new: currentVal };
                        state.affixes[edit.id] = oldVal;
                    }
                }
            }
        });

        return { groups };
    }
}
