// Global state to hold our database
const db = {
    items: new Map(), // Maps ID -> Item Data
    lookup: {},       // Maps GUID -> Name/Reference (from guid_lookup.json)
    textureLookup: {},// Maps GUID -> Texture Name (from texture_guid_lookup.json)
    eStatDefinition: [], // Array of Enum Names (from eStatDefinition.json)
    modifierType: [],    // Array of Enum Names (from modifierType.json)
    list: [],         // Array of processed items for easy filtering
    references: new Map() // Maps target ID -> Set of source IDs
};

// Map for Devotion Affinity conversion
const AFFINITY_MAP = {
    "00000000": "Red",
    "01000000": "Green",
    "02000000": "Blue"
};

function parseDevotionAffinity(affinityString) {
    if (!affinityString || typeof affinityString !== 'string') return "";
    
    const chunks = affinityString.match(/.{1,8}/g) || [];
    
    return chunks
        .map(chunk => AFFINITY_MAP[chunk])
        .filter(color => color !== undefined)
        .join(', '); // Joins the items into a single string separated by a comma and space
}

// Start the application
document.addEventListener("DOMContentLoaded", initWiki);

async function initWiki() {
    injectStyles();

    const fetchOptionalJson = async (url, fallback = {}) => {
        try {
            // Use "no-cache" to bypass old 404 errors saved in the browser
            const res = await fetch(url, { cache: "no-cache" });
            if (!res.ok) return fallback;
            
            return await res.json();
        } catch (err) {
            console.error(`Error loading or parsing ${url}:`, err);
            return fallback;
        }
    };

    try {
        // Fetch data files in parallel, stepping back one directory to find json_data
        const [monoRes, lookupData, textureLookupData, eStatDefData, modifierTypeData] = await Promise.all([
            fetch('../json_data/monoBehaviour.json'),
            fetchOptionalJson('../json_data/guid_lookup.json'),
            fetchOptionalJson('../json_data/texture_guid_lookup.json'),
            fetchOptionalJson('../json_data/eStatDefinition.json', []),
            fetchOptionalJson('../json_data/modifierType.json', [])
        ]);

        const rawMonoData = await monoRes.json();
        db.lookup = lookupData;
        db.textureLookup = textureLookupData;
        db.eStatDefinition = eStatDefData;
        db.modifierType = modifierTypeData;

        processData(rawMonoData);
        buildReferences();
        buildSidebar(db.list);
        setupSearch();

        // Check if there's a specific page in the URL hash
        window.addEventListener('hashchange', handleRouting);
        handleRouting();

    } catch (error) {
        console.error("Wiki Initialization Error:", error);
        document.getElementById('mainContent').innerHTML = `
            <h2>Error loading data</h2>
            <p>Make sure you are running a local web server.</p>
            <p>Error details: ${error.message}</p>
        `;
    }
}

/**
 * Parses Unity JSON dump and formats it into a usable structure.
 */
function processData(rawMonoData) {
    const seenTitles = new Set();
    
    // Standard Regex to detect exactly formatted GUIDs 
    // (e.g. 002718ca-d40e-4427-8955-03fcc3e5b9a1)
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    rawMonoData.forEach(entry => {
        if (!entry.MonoBehaviour) return;
        
        const mb = entry.MonoBehaviour;
        
        // Convert devotion affinity if present
        if (mb._devotionAffinity) {
            mb._devotionAffinity = parseDevotionAffinity(mb._devotionAffinity);
        }
        
        // Determine Unique ID
        const id = mb.GUID || mb.m_Name;
        if (!id) return;

        // Attempt to find a human-readable title
        const title = mb._nameLocalizationKey 
                   || mb._localizationKey 
                   || mb._descriptionLocalizationKey
                   || (db.lookup && db.lookup[id])
                   || mb.m_Name;

        const itemData = {
            id: id,
            title: title,
            data: mb
        };

        // 1. Always add to the main items Map. 
        // This ensures if a GUID or duplicate is referenced inside another item, 
        // the link will still successfully load the page.
        db.items.set(id, itemData);

        // 2. Filter for the Sidebar List
        const isGuid = guidRegex.test(title);
        const isDuplicate = seenTitles.has(title);

        if (!isGuid && !isDuplicate && title) {
            seenTitles.add(title);
            db.list.push(itemData);
        }
    });

    // Sort alphabetically for the sidebar
    db.list.sort((a, b) => a.title.localeCompare(b.title));
}


/**
 * Builds the sidebar navigation.
 */
function buildSidebar(itemsToRender) {
    const navList = document.getElementById('navigationList');
    navList.innerHTML = '';

    itemsToRender.forEach(item => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        
        a.href = `#${item.id}`;
        a.textContent = item.title;
        
        li.appendChild(a);
        navList.appendChild(li);
    });
}

/**
 * Handles basic #hash routing to load specific items.
 */
function handleRouting() {
    // Decode the hash to handle spaces and special characters properly
    const rawHash = window.location.hash.substring(1);
    const hash = decodeURIComponent(rawHash);
    
    if (hash && db.items.has(hash)) {
        renderPage(hash);
    }
}


/**
 * Generates the HTML for a specific item and injects it into the main view.
 */
function renderPage(id) {
    const item = db.items.get(id);
    if (!item) return;

    const content = document.getElementById('mainContent');
    let html = `<div class="wiki-header">`;
    html += `<h1>${item.title}</h1>`;
    html += `<div class="wiki-meta-id">ID: ${item.id}</div>`;
    html += `</div>`;
    
    // Add raw properties as a structured table
    html += `<div class="wiki-card"><div class="wiki-properties">`;
    html += generateObjectHTML(item.data);
    html += `</div></div>`;

    // Add "Referenced By" section
    if (db.references.has(item.id)) {
        const refs = Array.from(db.references.get(item.id));
        if (refs.length > 0) {
            html += `<div class="wiki-references-section">`;
            html += `<h2>Referenced By</h2>`;
            html += `<ul class="wiki-references-list">`;
            refs.forEach(refId => {
                const refItem = db.items.get(refId);
                if (refItem) html += `<li><a href="#${refItem.id}" class="wiki-link">${refItem.title}</a></li>`;
            });
            html += `</ul></div>`;
        }
    }

    content.innerHTML = html;
    window.scrollTo(0, 0);
}

/**
 * Tries to resolve a GUID or Name to an item in our database.
 */
function resolveItem(ref) {
    if (!ref) return null;
    if (db.items.has(ref)) return db.items.get(ref);
    
    // Use the guid_lookup to resolve cross-references by their real file names
    if (db.lookup && db.lookup[ref]) {
        const lookupName = db.lookup[ref];
        if (db.items.has(lookupName)) return db.items.get(lookupName);
        
        // Strip the path ("Assets/Path/") and the extension (".asset") to find the base name
        const baseName = lookupName.split(/[/\\]/).pop().replace(/\.[^/.]+$/, "");
        if (db.items.has(baseName)) return db.items.get(baseName);
        
        // Strip Unity sub-asset suffixes like "_0", "_1" from the base name
        const cleanBaseName = baseName.replace(/_\d+$/, "");
        if (db.items.has(cleanBaseName)) return db.items.get(cleanBaseName);
        
        // Final fallback: Check if the string matches any generated title in our sidebar
        const foundItem = db.list.find(i => i.title === lookupName || i.title === baseName || i.title === cleanBaseName);
        if (foundItem) return foundItem;
    }

    // Fallback for direct string references that bypass the lookup
    const cleanRef = ref.replace(/_\d+$/, "");
    if (db.items.has(cleanRef)) return db.items.get(cleanRef);

    return null;
}

/**
 * Scans through all items to build a reverse-reference map.
 */
function buildReferences() {
    for (const [sourceId, item] of db.items.entries()) {
        extractReferences(item.data, sourceId);
    }
}

/**
 * Recursively finds references inside an object.
 */
function extractReferences(obj, sourceId) {
    if (obj === null || obj === undefined) return;

    if (typeof obj === 'string') {
        if (db.items.has(obj) || (db.lookup && db.lookup[obj])) {
            const linkedItem = resolveItem(obj);
            if (linkedItem && linkedItem.id !== sourceId) {
                if (!db.references.has(linkedItem.id)) db.references.set(linkedItem.id, new Set());
                db.references.get(linkedItem.id).add(sourceId);
            }
        }
        return;
    }

    if (typeof obj === 'object') {
        if ('fileID' in obj && obj.guid) {
            const linkedItem = resolveItem(obj.guid);
            if (linkedItem && linkedItem.id !== sourceId) {
                if (!db.references.has(linkedItem.id)) db.references.set(linkedItem.id, new Set());
                db.references.get(linkedItem.id).add(sourceId);
            }
            return; // Stop here, no need to crawl inside the Unity reference object
        }

        Object.values(obj).forEach(val => {
            if (typeof val === 'object' || typeof val === 'string') {
                extractReferences(val, sourceId);
            }
        });
    }
}

/**
 * Recursively converts a JSON object/array into nested HTML tables/lists.
 * Automatically hyperlinks GUIDs if they exist in our database or lookup.
 */
function generateObjectHTML(obj) {
    if (obj === null || obj === undefined) return '<span class="value-null">null</span>';
    
    // Handle Primitive values
    if (typeof obj !== 'object') {
        if (typeof obj === 'string') {
            if (obj.trim() === '') return '<span class="value-empty">" "</span>';
            // If this string matches an ID in our database, make it a clickable link
            const linkedItem = resolveItem(obj);
            if (linkedItem) {
                return `<a href="#${linkedItem.id}" class="wiki-link">${linkedItem.title}</a>`;
            }
            // If it exists in the guid_lookup but not as a full Monobehaviour object
            if (db.lookup[obj]) {
                return `<span class="lookup-ref" title="${obj}">${db.lookup[obj]}</span>`;
            }
            return `<span class="value-string">"${obj}"</span>`;
        }
        if (typeof obj === 'boolean') return `<span class="value-bool">${obj}</span>`;
        if (typeof obj === 'number') return `<span class="value-number">${obj}</span>`;
        return `<span class="value-string">${obj}</span>`;
    }

    // Intelligently flatten Unity Reference Objects (fileID, guid, type)
    if ('fileID' in obj && Object.keys(obj).length <= 3) {
        if (obj.fileID === 0 && !obj.guid) return '<span class="value-null">None</span>';
        if (obj.guid) {
            const linkedItem = resolveItem(obj.guid);
            let displayName = db.lookup[obj.guid] ? db.lookup[obj.guid] : `Ref: ${obj.guid}`;
            
            let textureHtml = '';
            if (db.textureLookup && db.textureLookup[obj.guid]) {
                const texName = db.textureLookup[obj.guid];
                textureHtml = `<div class="wiki-sprite-wrapper" title="${texName}"><img src="../Texture2D/${texName}.png" class="wiki-sprite-preview" alt="${texName}" loading="lazy"></div>`;
            }

            let refHtml = '';
            if (linkedItem) {
                refHtml = `<a href="#${linkedItem.id}" class="wiki-link unity-ref-link">${linkedItem.title}</a>`;
            } else if (db.lookup[obj.guid]) {
                refHtml = `<span class="lookup-ref unity-ref-link" title="${obj.guid}">${displayName}</span>`;
            } else {
                refHtml = `<span class="unity-ref" title="${obj.guid}">${displayName}</span>`;
            }
            
            return textureHtml ? `<div class="unity-ref-with-image">${textureHtml}${refHtml}</div>` : refHtml;
        }
        return `<span class="unity-ref">FileID: ${obj.fileID}</span>`;
    }

    // Handle Arrays
    if (Array.isArray(obj)) {
        if (obj.length === 0) return '<span class="value-empty">[ Empty ]</span>';
        
        // Check if it's an array of simple primitives to display inline
        const isPrimitiveArray = obj.every(val => typeof val !== 'object' || val === null);
        if (isPrimitiveArray && obj.length <= 15) {
            return `<div class="wiki-array-inline">[ ${obj.map(val => generateObjectHTML(val)).join(', ')} ]</div>`;
        }

        const openAttr = obj.length <= 5 ? 'open' : '';
        let arrHtml = `<details class="wiki-array-container" ${openAttr}><summary class="wiki-array-summary">Array (${obj.length} items)</summary><ul class="wiki-array">`;
        obj.forEach((val, index) => {
            arrHtml += `<li><span class="array-index">${index}:</span> ${generateObjectHTML(val)}</li>`;
        });
        return arrHtml + '</ul></details>';
    }

    // Handle Objects
    // Strip Unity's single-key list wrappers (e.g. { "_list": [...] }) to prevent useless nesting
    const objKeys = Object.keys(obj);
    if (objKeys.length === 1 && ['_list', '_serializedList', 'array'].includes(objKeys[0])) {
        if (Array.isArray(obj[objKeys[0]])) {
            return generateObjectHTML(obj[objKeys[0]]);
        }
    }

    let objHtml = '<table class="wiki-table"><tbody>';
    let hasRows = false;

    for (const [key, value] of Object.entries(obj)) {
        // Hide Unity metadata noise that isn't useful for a wiki
        if (['m_ObjectHideFlags', 'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset', 'm_GameObject', 'm_EditorClassIdentifier', 'm_EditorHideFlags'].includes(key)) {
            continue; 
        }

        let valHtml = generateObjectHTML(value);
        
        // Intercept Enum Keys and append their string values if known
        if (typeof value === 'number') {
            if ((key === '_eStatDefinition' || key === 'eStatDefinition') && db.eStatDefinition && db.eStatDefinition.length > 0) {
                const enumName = db.eStatDefinition[value] ?? "Unknown";
                valHtml = `${valHtml} <span class="value-enum">(${enumName})</span>`;
            } else if ((key === '_modifierType' || key === '_statModifierType' || key === '_eModifierType') && db.modifierType && db.modifierType.length > 0) {
                const enumName = db.modifierType[value] ?? "Unknown";
                valHtml = `${valHtml} <span class="value-enum">(${enumName})</span>`;
            }
        }

        // Intercept eneabled/disabled flags and display them as booleans for better readability
        if (['enabled', 'm_Enabled'].includes(key) && typeof value === 'number') {
            valHtml = `<span class="value-bool">${value !== 0}</span>`;
        }

        objHtml += `
            <tr>
                <th class="prop-key">${key}</th>
                <td class="prop-value">${valHtml}</td>
            </tr>
        `;
        hasRows = true;
    }
    
    if (!hasRows) return '<span class="value-empty">{ Empty Object }</span>';
    return objHtml + '</tbody></table>';
}

/**
 * Hooks up the search input box to filter the sidebar.
 */
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        // Split the search query into individual words
        const searchTerms = e.target.value.toLowerCase().trim().split(/\s+/);
        
        const filteredList = db.list.filter(item => {
            const title = item.title.toLowerCase();
            const id = item.id.toLowerCase();
            
            // Return true only if EVERY word typed is found in either the title or the ID
            return searchTerms.every(term => title.includes(term) || id.includes(term));
        });
        buildSidebar(filteredList);
    });
}

/**
 * Injects beautiful syntax highlighting and layout styles dynamically.
 */
function injectStyles() {
    if (document.getElementById('wiki-dynamic-styles')) return;
    const style = document.createElement('style');
    style.id = 'wiki-dynamic-styles';
    style.innerHTML = `
        .wiki-header { border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 25px; }
        .wiki-header h1 { font-size: 2.2em; margin: 0 0 8px 0; color: #fff; }
        .wiki-meta-id { font-family: monospace; color: #777; background: #252526; padding: 5px 10px; border-radius: 4px; display: inline-block; border: 1px solid #333;}
        
        .wiki-card { display: inline-block; max-width: 100%; background-color: #1e1e1e; border: 1px solid #333; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); padding: 1px; overflow-x: auto;}
        
        .wiki-table { width: auto; border-collapse: collapse; background: #1e1e1e; font-size: 0.95em; }
        .wiki-table th, .wiki-table td { border-bottom: 1px solid #2d2d2d; padding: 12px 15px; text-align: left; vertical-align: top; }
        .wiki-table tr:last-child th, .wiki-table tr:last-child td { border-bottom: none; }
        .wiki-table th { white-space: nowrap; padding-right: 25px; background: #252526; color: #9cdcfe; font-weight: normal; border-right: 1px solid #2d2d2d; }
        .wiki-table td { color: #cccccc; }
        .wiki-table tr:hover th { background: #2d2d30; }
        .wiki-table tr:hover td { background: #262626; }
        
        .value-null { color: #569cd6; font-style: italic; }
        .value-empty { color: #6a9955; font-style: italic; }
        .value-bool { color: #569cd6; font-weight: bold; }
        .value-number { color: #b5cea8; }
        .value-string { color: #ce9178; word-break: break-word; }
        .value-enum { color: #4ec9b0; font-style: italic; font-size: 0.9em; margin-left: 6px; }
        
        .wiki-array-container { display: inline-block; background: #252526; border: 1px solid #333; border-radius: 6px; padding: 10px; min-width: 180px; }
        .wiki-array-summary { cursor: pointer; color: #4fc1ff; font-weight: bold; outline: none; user-select: none; transition: color 0.2s ease; }
        .wiki-array-summary:hover { color: #9cdcfe; }
        details[open] > .wiki-array-summary { margin-bottom: 10px; border-bottom: 1px dashed #444; padding-bottom: 6px; }
        .wiki-array { list-style: none; margin: 0; padding: 0; }
        .wiki-array li { padding: 4px 0; border-bottom: 1px dashed #333; display: flex; align-items: baseline; }
        .wiki-array li:last-child { border-bottom: none; padding-bottom: 0; }
        .array-index { color: #858585; font-family: monospace; margin-right: 10px; font-size: 0.85em; background: #1e1e1e; padding: 2px 5px; border-radius: 3px; border: 1px solid #333; }
        .wiki-array-inline { color: #d4d4d4; }
        
        .wiki-link, .lookup-ref { color: #4fc1ff; text-decoration: none; padding: 2px 6px; background: rgba(79, 193, 255, 0.1); border-radius: 4px; transition: 0.2s ease; border: 1px solid transparent; }
        .wiki-link:hover, .lookup-ref:hover { background: rgba(79, 193, 255, 0.2); border-color: rgba(79, 193, 255, 0.4); }
        .unity-ref { color: #c586c0; font-family: monospace; font-size: 0.9em; background: rgba(197, 134, 192, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(197, 134, 192, 0.2); word-break: break-all; }
        
        .unity-ref-with-image { display: inline-flex; align-items: center; gap: 12px; }
        .wiki-sprite-wrapper { background: #1e1e1e; padding: 4px; border: 1px solid #333; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
        .wiki-sprite-preview { max-width: 64px; max-height: 64px; object-fit: contain; image-rendering: pixelated; }

        .wiki-references-section { margin-top: 30px; border-top: 1px solid #333; padding-top: 20px; }
        .wiki-references-section h2 { color: #fff; font-size: 1.5em; margin-bottom: 15px; margin-top: 0; }
        .wiki-references-list { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
        .wiki-references-list li { background: #252526; padding: 4px 10px; border-radius: 4px; border: 1px solid #333; }

        /* Sidebar Styles */
        .search-box { position: sticky; top: 0; z-index: 100; background-color: #1e1e1e;}
        #searchInput { width: 100%; padding: 10px 12px; margin-bottom: 0; background: #1e1e1e; border: 1px solid #333; color: #ccc; border-radius: 6px; box-sizing: border-box; font-family: inherit; transition: 0.2s ease; }
        #searchInput:focus { outline: none; border-color: #4fc1ff; background: #252526; box-shadow: 0 0 0 1px rgba(79, 193, 255, 0.2); }
        #navigationList { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
        #navigationList a { display: block; padding: 4px 12px; color: #a9a9a9; text-decoration: none; border-radius: 4px; transition: all 0.2s ease; border: 1px solid transparent; font-size: 0.95em; }
        #navigationList a:hover { background: #252526; color: #4fc1ff; border-color: #333; }
    `;
    document.head.appendChild(style);
}