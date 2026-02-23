import { secureReviver, formatString, getEnglishTranslation } from './utils.js';

export class RelicDataManager {
    constructor(editor) {
        this.editor = editor;
        this.currentFileName = "PlayerSave0.json";
        this.data = {
            save: null,
            relics: null,
            affixes: null,
            config: null,
            skillsConfig: null
        };
        
        this.definitions = {
            relics: {}, 
            affixes: {},
            skills: {},
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

        this.reliquaryItems = [];
        this.stashCellSize = 60;
        
        this.rarityConfigMap = {};
        this.affixCategoryMap = {};
        this.affixSizeMap = {};
        this.affixPoolMap = {};
        this.nonDroppableAffixIds = new Set();

        this.statOverrides = {
            'MaxBarrier': 'Max. Conviction',
            'BarrierDecayResilience': 'Conviction Decay Resistance',
            'SkillManaCost': 'Mana Cost',
            'ManaRegen': 'Mana Regeneration',
        };
    }

    // ... (initAutoLoad and processDefinitions remain unchanged) ...
    async initAutoLoad() {
        const files = [
            { key: 'relics', path: 'json_data/relic_data/Relics.json' },
            { key: 'affixes', path: 'json_data/relic_data/Relic Affixes.json' },
            { key: 'config', path: 'json_data/relic_data/Relic Inventory Config.json' },
            { key: 'skillsConfig', path: 'json_data/relic_data/Skills Config.json' },
            { key: 'skills', path: 'json_data/relic_data/Skills.json' }
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
            this.editor.enableSaveUpload();

            const cellSizeSlider = document.querySelector('input[type="range"][min="65"]');
            if (cellSizeSlider) {
                this.editor.updateGridSettings(cellSizeSlider.value); 
                this.editor.renderer.updateSliderFill(cellSizeSlider);
            }

            const restrictCheckbox = document.getElementById('chk-restrict');
            if (restrictCheckbox) this.editor.restrictAffixes = restrictCheckbox.checked; 

            const searchRestrictCheckbox = document.getElementById('chk-search-restrict');
            if (searchRestrictCheckbox) this.editor.restrictSearch = searchRestrictCheckbox.checked;
            
        } catch (error) {
            console.error(error);
            alert("Error loading data files. Please check the 'relic_data' folder exists.");
        }
    }

    processDefinitions() {
        this.nonDroppableAffixIds.clear();
        const droppableAffixIds = new Set();

        if (this.data.skills && this.data.skills.Skills) {
            this.data.skills.Skills.forEach(s => {
                this.definitions.skills[s.id] = s;
            });
        }

        if (this.data.relics && this.data.relics.Relics) {
            this.data.relics.Relics.forEach(r => {
                this.definitions.relics[r.id] = r;
                if (r.intrinsicAffixes) {
                    r.intrinsicAffixes.forEach(a => {
                        if (a && a.id) {
                            if (r.canDrop !== false) droppableAffixIds.add(a.id);
                            else this.nonDroppableAffixIds.add(a.id);
                        }
                    });
                }
            });
            droppableAffixIds.forEach(id => this.nonDroppableAffixIds.delete(id));
        }
        
        if (this.data.affixes && this.data.affixes["Relic Affixes"]) {
            this.data.affixes["Relic Affixes"].forEach(a => this.definitions.affixes[a.id] = a);
        }

        if (this.data.affixes && this.data.affixes.relicUpgradeModifierConfig) {
            this.definitions.defaultUpgradeModifiers = this.data.affixes.relicUpgradeModifierConfig.upgradeModifier;
        }

        this.rarityConfigMap = {};
        if (this.data.config && this.data.config.relicRarityConfigs) {
            this.data.config.relicRarityConfigs.forEach((cfg, index) => {
                this.rarityConfigMap[index] = cfg;
                this.rarityConfigMap[cfg.eRelicRarity] = cfg;
            });
        }

        this.affixCategoryMap = {};
        this.affixSizeMap = {};
        if (this.data.config && this.data.config.relicSizeConfigs) {
            const catNameToId = {
                "FuryImbued": 0,
                "FaithImbued": 1,
                "DisciplineImbued": 2,
                "Corrupted": 3
            };

            Object.entries(this.data.config.relicSizeConfigs).forEach(([sizeKey, sizeConfig]) => {
                if (sizeConfig.relicInventoryShape) {
                    this.definitions.sizes[sizeKey] = {
                        w: sizeConfig.relicInventoryShape.width,
                        h: sizeConfig.relicInventoryShape.height
                    };
                }

                if (sizeConfig.implicitAffixPool) {
                    Object.entries(sizeConfig.implicitAffixPool).forEach(([poolName, entries]) => {
                        const catId = catNameToId[poolName];
                        if (catId !== undefined && Array.isArray(entries)) {
                            entries.forEach(entry => {
                                const affixId = entry.value ? entry.value.id : null;
                                if (affixId !== null) {
                                    if (!this.affixCategoryMap[affixId]) {
                                        this.affixCategoryMap[affixId] = [];
                                    }
                                    if (!this.affixCategoryMap[affixId].includes(catId)) {
                                        this.affixCategoryMap[affixId].push(catId);
                                    }

                                    if (!this.affixSizeMap[affixId]) {
                                        this.affixSizeMap[affixId] = [];
                                    }
                                    if (!this.affixSizeMap[affixId].includes(sizeKey)) {
                                        this.affixSizeMap[affixId].push(sizeKey);
                                    }
                                }
                            });
                        }
                    });
                }
            });
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
        this.currentFileName = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.data.save = JSON.parse(e.target.result, secureReviver);
                if (!this.data.save || !this.data.save._relicLoadoutsSaveData) {
                    throw new Error("Invalid save file structure.");
                }
                
                this.reliquaryItems = [];
                if (this.data.save.externalInventorySaveData && Array.isArray(this.data.save.externalInventorySaveData.ItemPages)) {
                    this.data.save.externalInventorySaveData.ItemPages.forEach((page, pIndex) => {
                        if (page.Items && Array.isArray(page.Items)) {
                            page.Items.forEach(item => {
                                item._pageIndex = pIndex;
                                this.reliquaryItems.push(item);
                            });
                        }
                    });
                } else {
                    this.reliquaryItems = [];
                }

                if (this.editor.changelogManager) {
                    this.editor.changelogManager.edits = [];
                    this.editor.changelogManager.appliedWatermarks = [];
                }
                this.editor.initEditorUI();
            } catch (err) {
                alert(`Error parsing save file: ${err.message}`);
                console.error(err);
            }
        };
        reader.readAsText(file);
    }

    downloadSave() {
        if (!this.data.save) return;

        // Sync Reliquary items back to save structure
        if (this.data.save.externalInventorySaveData) {
            const pagesList = [];
            let boughtPages = this.data.save.externalInventorySaveData.BoughtPages || 0;
            let totalPageCount = boughtPages + 3;
            
            for (let i = 0; i < totalPageCount; i++) {
                pagesList.push({ Items: [] });
            }

            this.reliquaryItems.forEach(item => {
                const p = item._pageIndex || 0;
                if (pagesList[p]) pagesList[p].Items.push(item);
            });

            this.data.save.externalInventorySaveData.ItemPages = pagesList;
            this.data.save.externalInventorySaveData.BoughtPages = boughtPages;
        }

        this.editor.changelogManager.applyWatermarks(this.data.save);

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.data.save, null, 4));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = this.currentFileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // ... (getRelicName, getAffixName, etc. remain unchanged) ...
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

    getAffixName(affixId) {
        const def = this.definitions.affixes[affixId];
        if (!def) return `ID: ${affixId}`;

        if (def.skillDefinition && def.skillDefinition.id !== undefined) {
            const skillId = def.skillDefinition.id;
            const skillDef = this.definitions.skills[skillId];
            if (skillDef) {
                const en = getEnglishTranslation(skillDef.localizedName);
                if (en) return en;
                if (skillDef.name) return formatString(skillDef.name);
            }
        }

        if (def.type === 'StatModifierAffixDefinition' && def.eStatDefinition) {
            const en = getEnglishTranslation(def.nameLocalizationKey);
            if (en === 'All Resistances') return en;
            return this.formatStatName(def.eStatDefinition);
        }
        if (def.type === 'RegenOnKillAffixDefinition' && def.eStatRegen) {
             return this.formatStatName(def.eStatRegen);
        }
        
        const enName = getEnglishTranslation(def.nameLocalizationKey);
        if (enName) return enName;

        if (def.name && !def.name.startsWith("Stat -")) return formatString(def.name);
        
        if (def.eStatDefinition) {
            return this.formatStatName(def.eStatDefinition);
        }
        return `ID: ${affixId}`;
    }

    formatStatName(stat) {
        if (this.statOverrides[stat]) return this.statOverrides[stat];
        let name = stat;
        if (name.startsWith('Additional')) name = name.replace('Additional', '');
        return formatString(name);
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

    getMaxSkillUpgradeLevelBonus() {
        if (this.data.skillsConfig && this.data.skillsConfig.maxSkillUpgradeLevelBonus !== undefined) {
            return this.data.skillsConfig.maxSkillUpgradeLevelBonus;
        }
        return 0;
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

    getAffixSizes(defId) {
        return this.affixSizeMap[defId] || [];
    }

    getAffixCategory(defId) {
        const mapping = this.affixCategoryMap || {};
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

        if (def.id === 0 || def.id === 1) format = "Percentage";

        switch (format) {
            case "Percentage":
                const pct = Math.abs((val * 100).toFixed(2));
                return `${this.getValueSign(val)}${pct}%`;
            case "MultiplicativeAdditive":
                if (val > 1) val -= 1;
                const multiAddPct = (val * 100).toFixed(2);
                return `${this.getValueSign(multiAddPct)}${multiAddPct}%[+]`;

            case "Multiplicative":
                return `${this.getValueSign(val - 1)}${parseFloat(((val - 1) * 100).toFixed(2))}%[x]`;

            case "Additive":
                if (!Number.isInteger(range[0])) return `${this.getValueSign(val)}${parseFloat((val * 100).toFixed(2))}%`;

                return `${this.getValueSign(val)}${parseFloat(val.toFixed(2))}`;

            case "Rounded":
                return `${this.getValueSign(val)}${Math.round(val).toString()}`;

            case "NoFormat":
            default:
                return `${this.getValueSign(val)}${parseFloat(val.toFixed(2))}`;
        }
    }

    hasReachedAffixLimit(relicItem, type) {
        if (!this.editor.restrictAffixes) return false;
        const def = this.definitions.relics[relicItem._relicBaseDefinitionID];
        if (!def) return false;
        const limitRange = (type === 'primary') ? def.primaryAffixAmount : def.secondaryAffixAmount;
        
        let limit = limitRange ? limitRange[1] : 0;

        const rarityCfg = this.rarityConfigMap[relicItem._eRelicRarity];
        if (rarityCfg) {
            const size = def.eRelicSize || "Small";
            const bonusMap = (type === 'primary') ? rarityCfg.additionalPrimaryAffixAmount : rarityCfg.additionalSecondaryAffixAmount;
            if (bonusMap && bonusMap[size]) {
                limit += bonusMap[size][1];
            }
        }

        const pool = (type === 'primary') ? def.primaryAffixPool : def.secondaryAffixPool;
        const poolIds = pool ? pool.map(entry => entry.value.id) : [];
        const currentCount = (relicItem._affixesData || []).filter(affix =>
            poolIds.length === 0 || poolIds.includes(affix._relicAffixDefinitionId)
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

    getValueSign(val) {
        return val >= 0 ? "+" : "";
    }
}
