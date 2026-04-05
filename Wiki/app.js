// Global state to hold our database
const db = {
    items: new Map(), // Maps ID -> Item Data
    lookup: {},       // Maps GUID -> Name/Reference (from guid_lookup.json)
    list: [],         // Array of processed items for easy filtering
    references: new Map() // Maps target ID -> Set of source IDs
};

// Start the application
document.addEventListener("DOMContentLoaded", initWiki);

async function initWiki() {
    injectStyles();
    try {
        // Fetch data files in parallel, stepping back one directory to find json_data
        const [monoRes, lookupRes] = await Promise.all([
            fetch('../json_data/monoBehaviour.json'),
            fetch('../json_data/guid_lookup.json').catch(() => ({ json: () => ({}) })) // Fallback if lookup is missing
        ]);

        const rawMonoData = await monoRes.json();
        db.lookup = await lookupRes.json();

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
        
        // Final fallback: Check if the string matches any generated title in our sidebar
        const foundItem = db.list.find(i => i.title === lookupName || i.title === baseName);
        if (foundItem) return foundItem;
    }
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
            
            if (linkedItem) {
                return `<a href="#${linkedItem.id}" class="wiki-link unity-ref-link">${linkedItem.title}</a>`;
            }
            if (db.lookup[obj.guid]) return `<span class="lookup-ref unity-ref-link" title="${obj.guid}">${displayName}</span>`;
            return `<span class="unity-ref" title="${obj.guid}">${displayName}</span>`;
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
        if (['m_ObjectHideFlags', 'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset', 'm_GameObject', 'm_Script', 'm_EditorClassIdentifier', 'm_EditorHideFlags', 'm_Enabled'].includes(key)) {
            continue; 
        }

        // Clean up the key name for display (e.g. "_maxLevel" -> "Max Level")
        let cleanKey = key.replace(/^m_/, '').replace(/^_/, '');
        cleanKey = cleanKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();

        objHtml += `
            <tr>
                <th class="prop-key">${cleanKey}</th>
                <td class="prop-value">${generateObjectHTML(value)}</td>
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
        const query = e.target.value.toLowerCase();
        const filteredList = db.list.filter(item => 
            item.title.toLowerCase().includes(query) || 
            item.id.toLowerCase().includes(query)
        );
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
        
        .wiki-references-section { margin-top: 30px; border-top: 1px solid #333; padding-top: 20px; }
        .wiki-references-section h2 { color: #fff; font-size: 1.5em; margin-bottom: 15px; margin-top: 0; }
        .wiki-references-list { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
        .wiki-references-list li { background: #252526; padding: 4px 10px; border-radius: 4px; border: 1px solid #333; }
    `;
    document.head.appendChild(style);
}