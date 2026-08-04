import { getGameData } from './data.js';
import * as templates from './templates.js';

/**
 * Parses DropDex content (which is now EJS) and returns HTML.
 * @param {string} textContent - The raw text content of the DropDex page.
 * @returns {Promise<string>} The parsed content as an HTML string.
 */
export async function parseContent(textContent, extraContext = {}) {
    const readArrayData = async (path) => {
        const data = await getGameData(path);
        return Array.isArray(data) ? data : [];
    };

    // Pre-load all necessary data to pass to the templates.
    // This avoids multiple fetches within template functions.
    const allAffixData = await readArrayData('Relic Affixes.json');
    const allRelics = await readArrayData('Relics.json');
    const allTCs = await readArrayData('Treasure Class.json');
    const allDungeons = await readArrayData('Dungeons.json');
    const allSkills = await readArrayData('Skills.json');

    const context = {
        // Pass all template functions from /templates/index.js
        ...templates,
        // Pass all data
        allAffixData,
        allRelics,
        allTCs,
        allDungeons,
        allSkills,
        ...extraContext,
    };

    try {
        // Assuming ejs is loaded globally from DropDex.html
        const renderedHtml = await ejs.render(textContent, context, { async: true });
        return renderedHtml;
    } catch (error) {
        console.error("EJS rendering error:", error);
        return `<pre class="error">Template Error: ${error.message}</pre>`;
    }
}