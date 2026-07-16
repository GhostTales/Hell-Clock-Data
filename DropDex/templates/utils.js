import { getGameData } from '../data.js';

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

export function calculateModifiedRelicWeights(availableRelics, allRelics, devotions, devotionColorMap, highestDevotionType, devotionBonus) {
    return availableRelics.map(r => {
        const fullRelicData = allRelics.find(fullRelic => fullRelic.id === r.value.id);
        let currentRelicWeight = r.weight;

        let meetsConditions = true;
        if (fullRelicData && fullRelicData.availabilityConditions && fullRelicData.availabilityConditions.conditionsConfigList) {
            for (const cond of fullRelicData.availabilityConditions.conditionsConfigList) {
                if (cond.condition.includes("Devotion Condition")) {
                    const requiredDevotionColor = cond.required_devotion.toLowerCase();
                    const requiredValue = parseInt(cond.targetValue, 10);
                    const devotionTypeKey = Object.keys(devotionColorMap).find(key => devotionColorMap[key] === requiredDevotionColor);
                    
                    if (devotionTypeKey && devotions[devotionTypeKey] < requiredValue) {
                        meetsConditions = false;
                        break;
                    }
                }
            }
        }

        if (!meetsConditions) {
            currentRelicWeight = 0;
        }

        if (currentRelicWeight > 0 && highestDevotionType && fullRelicData) {
            const devotionColor = devotionColorMap[highestDevotionType];
            const affinity = fullRelicData.devotionAffinity;

            if (devotionColor && affinity) {
                let hasAffinity = false;
                if (Array.isArray(affinity)) {
                    hasAffinity = affinity.some(a => typeof a === 'string' && a.toLowerCase() === devotionColor);
                } else if (typeof affinity === 'string') {
                    hasAffinity = affinity.toLowerCase() === devotionColor;
                }

                if (hasAffinity) {
                    currentRelicWeight *= devotionBonus;
                }
            }
        }
        return { id: r.value.id, weight: currentRelicWeight };
    });
}