// Manual mapping for non-unique relics that are missing the 'sprite' property.
export const nonUniqueRelicIconMap = {
    // Example: "InternalRelicName": "icon_file_name_without_extension"
    "SmallRelic_Tier1_Skull": "IconRelic_Small1",
    "SmallRelic_Tier1_Cross": "IconRelic_Small2",
    "SmallRelic_Tier2": ["IconRelic_Small1", "IconRelic_Small2"],
    "SmallRelic_Tier3": "IconRelic_small3",
    "SmallRelic_Tier4": "IconRelic_small4",
    "LargeRelic_Tier1_Feather": "IconRelic_Large1",
    "LargeRelic_Tier1_Bull": "IconRelic_Large2",
    "LargeRelic_Tier2": ["IconRelic_Large1", "IconRelic_Large2"],
    "LargeRelic_Tier3": "IconRelic_large3",
    "LargeRelic_Tier4": "IconRelic_large4",
    "GrandRelic_Tier1_Necklace": "IconRelic_Grand1",
    "GrandRelic_Tier1_WoodenImage": "IconRelic_Grand2",
    "GrandRelic_Tier2": ["IconRelic_Grand1", "IconRelic_Grand2"],
    "GrandRelic_Tier3": "IconRelic_Grand3",
    "GrandRelic_Tier4": "IconRelic_Grand4",
    "ExaltedRelic_Tier1_Book": "IconRelic_exalted1",
    "ExaltedRelic_Tier1_Poster": "IconRelic_exalted2",
    "ExaltedRelic_Tier2": ["IconRelic_exalted1", "IconRelic_exalted2"],
    "ExaltedRelic_Tier3": "IconRelic_exalted3",
    "ExaltedRelic_Tier4": "IconRelic_exalted4"
};

// Manual mapping for dungeon config names to more user-friendly shorthand names.
export const DungeonConfigNameShorthandMap = {
        "Act01_DungeonConfig_Oblivion": "act 1 Oblivion",
        "Act02_DungeonConfig_Oblivion": "act 2 Oblivion",
        "Act03_DungeonConfig_Oblivion": "act 3 Oblivion",
        "Act04_DungeonConfig_Oblivion": "act 4 Oblivion",
        "Act01_DungeonConfig_Abyss": "act 1 Abyss",
        "Act02_DungeonConfig_Abyss": "act 2 Abyss",
        "Act03_DungeonConfig_Abyss": "act 3 Abyss",
        "Act04_DungeonConfig_Abyss": "act 4 Abyss",
        "Act01_DungeonConfig": "act 1 Normal",
        "Act02_DungeonConfig": "act 2 Normal",
        "Act03_DungeonConfig": "act 3 Normal",
        "Act04_DungeonConfig": "act 4 Normal",
        "Nightmare T1 Novice - Dungeon Config": "T1 Endless Nightmare",
        "Nightmare T2 Novice - Dungeon Config": "T2 Endless Nightmare",
        "Nightmare T3 Novice - Dungeon Config": "T3 Endless Nightmare",
        "Nightmare T4 Novice - Dungeon Config": "T4 Endless Nightmare",
        "Nightmare T5 Abyss - Dungeon Config": "T5 Endless Nightmare",
        "Nightmare T6 Abyss - Dungeon Config": "T6 Endless Nightmare",
        "Nightmare T7 Abyss - Dungeon Config": "T7 Endless Nightmare",
        "Nightmare T8 Abyss - Dungeon Config": "T8 Endless Nightmare",
        "Nightmare T9 Oblivion - Dungeon Config": "T9 Endless Nightmare",
        "Nightmare T10 Oblivion - Dungeon Config": "T10 Endless Nightmare",
        "Nightmare T11 Oblivion - Dungeon Config": "T11 Endless Nightmare",
        "Nightmare T12 Oblivion - Dungeon Config": "T12 Endless Nightmare",
        "Nightmare T13 Void - Dungeon Config": "T13 Endless Nightmare",
        "Nightmare T14 Void - Dungeon Config": "T14 Endless Nightmare",
        "Nightmare T15 Void - Dungeon Config": "T15 Endless Nightmare",
        "Nightmare T16 Void - Dungeon Config": "T16 Endless Nightmare",
        "Act01_DungeonConfig_Void": "act 1 Void",
        "Act02_DungeonConfig_Void": "act 2 Void",
        "Act03_DungeonConfig_Void": "act 3 Void",
        "Act04_DungeonConfig_Void": "act 4 Void",
        "Act01_Endgame_DungeonConfig": "act 1 Ascension",
        "Act02_Endgame_DungeonConfig": "act 2 Ascension",
        "Act03_Endgame_DungeonConfig": "act 3 Ascension",
        "Act04_Endgame_DungeonConfig": "act 4 Ascension"
    };


export const devotionColorMap = {
        "red": "Fury",
        "blue": "Faith",
        "green": "Discipline",
        "neutral": "Neutral"
    };

export const relicSizeMap = {
        "Grand": "Grand (4x1)",
        "Exalted": "Exalted (2x2)",
        "Large": "Large (2x1)",
        "Small": "Small (1x1)"
    };

export const getEnLoc = (locKey) => {
    if (!Array.isArray(locKey)) return '';
    const en = locKey.find(l => l.langCode === 'en');
    return en ? en.langTranslation : '';
};

export function getRelicSpriteNames(relic) {
    if (!relic) return null;
    if (relic.sprite) return relic.sprite;
    return nonUniqueRelicIconMap[relic.name] || null;
}

export function getRelicIconUrl(relic) {
    const spriteNames = getRelicSpriteNames(relic);
    if (!spriteNames) return null;

    const spriteName = Array.isArray(spriteNames) ? spriteNames[0] : spriteNames;
    return `https://raw.githubusercontent.com/RogueSnail/hellclock-data-export/main/icons/${spriteName}.png`;
}

// Mirrors DevotionDropModifierConfig in Constellations.json (identical for Fury, Faith and Discipline).
export const DEVOTION_DROP_MODIFIER_CONFIG = {
    minimumPoints: 4,
    baseModifier: 1,
    modifierIncrementPerDevotionPoint: 0.1,
};

export function getDevotionDropModifier(points) {
    const { minimumPoints, baseModifier, modifierIncrementPerDevotionPoint } = DEVOTION_DROP_MODIFIER_CONFIG;
    const extraPoints = points - minimumPoints;
    if (extraPoints < 0) return 1;
    return 1 + baseModifier + modifierIncrementPerDevotionPoint * extraPoints;
}

/**
 * Weight multiplier for a relic: 1 without affinity, otherwise the best modifier among its affinities.
 * Categories without a drop modifier (e.g. Neutral) count as 1.
 */
export function getRelicDevotionModifier(affinity, devotionModifiers = {}, devotionColorMap = {}) {
    const list = Array.isArray(affinity) ? affinity : (typeof affinity === 'string' ? [affinity] : []);
    if (list.length === 0) return 1;
    return Math.max(...list.map(a => {
        const name = typeof a === 'string' ? devotionColorMap[a.toLowerCase()] : null;
        return devotionModifiers[name] ?? 1;
    }));
}

export function createDevotionModifierNote(devotionModifiers) {
    const active = Object.entries(devotionModifiers).filter(([, mod]) => mod > 1);
    if (active.length === 0) return '';
    const text = active.map(([name, mod]) => `${name} ${mod.toFixed(2)}x`).join(', ');
    return `<p style="font-size: 0.9em;"><i>Devotion weight multipliers applied to relics with a matching affinity: ${text}. Relics with several affinities use their best multiplier.</i></p>`;
}

export function getDevotionBonusContext(devotionPoints = {}) {
    const safePoints = (value) => {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
    };

    const devotions = {
        Fury: safePoints(devotionPoints.furyPoints),
        Faith: safePoints(devotionPoints.faithPoints),
        Discipline: safePoints(devotionPoints.disciplinePoints),
    };

    const devotionModifiers = {};
    for (const [name, points] of Object.entries(devotions)) {
        devotionModifiers[name] = getDevotionDropModifier(points);
    }

    return {
        devotions,
        devotionModifiers,
    };
}

export function getFloorTreasureClassRefs(floorConfig) {
    const refs = {
        "Regular Enemy": floorConfig.regularEnemyTreasureClass,
        "Champion Enemy": floorConfig.championEnemyTreasureClass,
        "Rare Enemy": floorConfig.rareEnemyTreasureClass,
        "Unique Enemy": floorConfig.uniqueEnemyTreasureClass,
        "Boss": floorConfig.bossEnemyTreasureClass,
        "Breakable": floorConfig.breakableTreasureClass,
        "Basic Gear": floorConfig.basicGearTreasureClass,
        "Blessed Gear": floorConfig.blessedGearTreasureClass,
        "Relic": floorConfig.relicTreasureClass,
        "Unique Relic": floorConfig.uniqueRelicTreasureClass,
    };

    if (floorConfig.chestTreasureClass && typeof floorConfig.chestTreasureClass === 'object') {
        for (const chestType in floorConfig.chestTreasureClass) {
            refs[`${chestType} Chest`] = floorConfig.chestTreasureClass[chestType];
        }
    }

    return refs;
}

export function calculateModifiedRelicWeights(availableRelics, allRelics, devotions = {}, devotionColorMap = {}, devotionModifiers = {}) {
    return availableRelics.map(r => {
        const fullRelicData = allRelics.find(fullRelic => fullRelic.id === r.value.id);
        let currentRelicWeight = r.weight;

        let meetsConditions = true;
        if (fullRelicData && fullRelicData.availabilityConditions && fullRelicData.availabilityConditions.conditionsConfigList) {
            for (const cond of fullRelicData.availabilityConditions.conditionsConfigList) {
                if (cond.condition.includes("Devotion Condition")) {
                    const requiredDevotionName = devotionColorMap[cond.required_devotion.toLowerCase()];
                    const requiredValue = parseInt(cond.targetValue, 10);
                    
                    // If the user's devotion points for the required type are less than the required value, the relic cannot drop.
                    if (requiredDevotionName && devotions[requiredDevotionName] < requiredValue) {
                        meetsConditions = false;
                        break;
                    }
                }
            }
        }

        if (!meetsConditions) {
            currentRelicWeight = 0;
        }

        if (currentRelicWeight > 0 && fullRelicData) {
            currentRelicWeight *= getRelicDevotionModifier(fullRelicData.devotionAffinity, devotionModifiers, devotionColorMap);
        }
        return { id: r.value.id, weight: currentRelicWeight };
    });
}