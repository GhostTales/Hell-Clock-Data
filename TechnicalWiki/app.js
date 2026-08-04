const EXPORT_BASES = [
    'https://raw.githubusercontent.com/RogueSnail/hellclock-data-export/main/data/'
];

const EXPORT_FILES = [
    'Ailment Config.json',
    'Blessing Roll Groups.json',
    'Blessings.json',
    'Campaign Bell.json',
    'Constellations.json',
    'Currency.json',
    'Dungeons.json',
    'Enemies.json',
    'Gear Rarity.json',
    'Gear Slot.json',
    'Gear.json',
    'Infernal Bell.json',
    'Oblivion Bell.json',
    'Penances.json',
    'Player Sheet.json',
    'Relic Affixes.json',
    'Relic Inventory Config.json',
    'Relics.json',
    'Seasons.json',
    'Skills Config.json',
    'Skills.json',
    'Stats.json',
    'Status.json',
    'Treasure Class.json',
    'World Tiers.json'
];

const EXPORT_REPO_COMMITS_API = 'https://api.github.com/repos/RogueSnail/hellclock-data-export/commits?per_page=1';
const EXPORT_REPO_URL = 'https://github.com/RogueSnail/hellclock-data-export';

const db = {
    items: new Map(),
    aliases: new Map(),
    list: [],
    references: new Map(),
    dataSourceByFile: new Map(),
    exportLastModifiedDates: [],
    summary: {
        loadedFiles: 0,
        localCount: 0,
        remoteCount: 0
    },
    updateInfo: {
        value: 'Could not be determined.',
        source: 'Unknown'
    }
};

document.addEventListener('DOMContentLoaded', initWiki);

async function initWiki() {
    try {
        const payloads = await Promise.all(EXPORT_FILES.map((fileName) => fetchOfficialJson(fileName)));
        processOfficialData(payloads);
        populateSummary(payloads.length);
        db.updateInfo = await fetchLastUpdateInfo();
        buildReferences();
        buildSidebar(db.list);
        renderSidebarLastUpdated();
        setupSearch();
        setupCurveInteractivity();
        window.addEventListener('hashchange', handleRouting);
        handleRouting();
    } catch (error) {
        console.error('Wiki Initialization Error:', error);
        document.getElementById('mainContent').innerHTML = `
            <h2>Error loading official export data</h2>
            <p>${escapeHtml(error.message)}</p>
        `;
    }
}

async function fetchOfficialJson(fileName) {
    const encodedName = encodeURIComponent(fileName);
    const errors = [];

    for (const base of EXPORT_BASES) {
        const url = `${base}${encodedName}`;
        try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) {
                errors.push(`${url} -> HTTP ${res.status}`);
                continue;
            }

            const data = await res.json();
            db.dataSourceByFile.set(fileName, base);
            const modifiedHeader = res.headers.get('last-modified');
            if (modifiedHeader) {
                const parsed = new Date(modifiedHeader);
                if (!Number.isNaN(parsed.getTime())) {
                    db.exportLastModifiedDates.push(parsed);
                }
            }
            return { fileName, data };
        } catch (err) {
            errors.push(`${url} -> ${err.message}`);
        }
    }

    throw new Error(`Failed to load ${fileName}. Attempts: ${errors.join(' | ')}`);
}

function populateSummary(loadedFileCount) {
    const localCount = 0;
    db.summary = {
        loadedFiles: loadedFileCount,
        localCount,
        remoteCount: loadedFileCount - localCount
    };
}

async function fetchLastUpdateInfo() {
    try {
        const response = await fetch(EXPORT_REPO_COMMITS_API, { cache: 'no-cache' });
        if (response.ok) {
            const commits = await response.json();
            const commitDate = commits?.[0]?.commit?.committer?.date;
            if (commitDate) {
                return {
                    value: formatUtcDate(new Date(commitDate)),
                    source: 'GitHub API'
                };
            }
        }
    } catch (error) {
        console.warn('Failed to read last commit date for export repo:', error);
    }

    if (db.exportLastModifiedDates.length > 0) {
        const latest = new Date(Math.max(...db.exportLastModifiedDates.map((d) => d.getTime())));
        return {
            value: formatUtcDate(latest),
            source: 'Export file headers'
        };
    }

    return {
        value: 'Could not be determined.',
        source: 'Unknown'
    };
}

function formatUtcDate(date) {
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short'
    });
}

function processOfficialData(payloads) {
    payloads.forEach(({ fileName, data }) => {
        const rootEntries = Object.entries(data);

        if (rootEntries.length === 0) {
            return;
        }

        rootEntries.forEach(([collectionName, value]) => {
            const records = Array.isArray(value) ? value : [value];
            records.forEach((record, index) => {
                const normalized = normalizeRecord(record, {
                    fileName,
                    collectionName,
                    index
                });

                db.items.set(normalized.id, normalized);
                db.list.push(normalized);
                registerAliases(normalized);
            });
        });
    });

    db.list.sort((a, b) => a.title.localeCompare(b.title));
}

function normalizeRecord(record, ctx) {
    const safeRecord = isPlainObject(record) ? record : { value: record };
    const type = asString(safeRecord.type) || ctx.collectionName;
    const name = asString(safeRecord.name) || `${ctx.collectionName}_${ctx.index + 1}`;
    const numericId = Number.isInteger(safeRecord.id) ? safeRecord.id : null;
    const title = buildTitle(safeRecord, name);
    const canonicalId = `${ctx.collectionName}:${type}:${name}`;

    return {
        id: canonicalId,
        title,
        type,
        name,
        numericId,
        sourceFile: ctx.fileName,
        data: safeRecord
    };
}

function buildTitle(record, fallbackName) {
    const localized =
        pickLocalizedText(record.localizedName) ||
        pickLocalizedText(record.nameLocalizationKey) ||
        pickLocalizedText(record.localizationKey) ||
        pickLocalizedText(record.actLocalizationKey) ||
        pickLocalizedText(record.descriptionKey);

    if (localized && fallbackName && localized.toLowerCase() !== fallbackName.toLowerCase()) {
        return `${localized} (${fallbackName})`;
    }

    return localized || fallbackName;
}

function registerAliases(item) {
    addAlias(item.id, item.id);
    addAlias(item.name, item.id);
    addAlias(`${item.type}:${item.name}`, item.id);
    if (item.numericId !== null) {
        addAlias(`${item.type}#${item.numericId}`, item.id);
    }
}

function addAlias(alias, itemId) {
    if (!alias) return;
    const key = normalizeAlias(alias);
    if (!db.aliases.has(key)) {
        db.aliases.set(key, new Set());
    }
    db.aliases.get(key).add(itemId);
}

function normalizeAlias(value) {
    return String(value).trim().toLowerCase();
}

function pickLocalizedText(value) {
    if (!Array.isArray(value) || value.length === 0) {
        return null;
    }

    const translations = value.filter(
        (entry) => isPlainObject(entry) && typeof entry.langCode === 'string' && typeof entry.langTranslation === 'string'
    );

    if (translations.length === 0) {
        return null;
    }

    const english = translations.find((entry) => entry.langCode.toLowerCase() === 'en');
    return (english || translations[0]).langTranslation;
}

function asString(value) {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function renderWelcome(loadedFileCount) {
    const content = document.getElementById('mainContent');
    if (!content) {
        return;
    }
    const summary = db.summary.loadedFiles ? db.summary : {
        loadedFiles: loadedFileCount || 0,
        localCount: 0,
        remoteCount: 0
    };

    content.innerHTML = `
        <h1>Welcome to the Technical Wiki</h1>
        <p>Select an entry from the sidebar to inspect the official Hell Clock export data.</p>
        ${renderLastUpdatedSection('welcome')}
    `;
}

function renderLastUpdatedSection(location = 'sidebar') {
    const contentClass = location === 'welcome' ? 'wiki-update-box wiki-update-box-welcome' : 'wiki-update-box';
    const sourceLine = db.updateInfo.source && db.updateInfo.source !== 'Unknown'
        ? `<p class="wiki-update-source">Source: ${escapeHtml(db.updateInfo.source)}</p>`
        : '';

    return `
        <section class="${contentClass}">
            <p>Last data repository update: <strong>${escapeHtml(db.updateInfo.value)}</strong></p>
            ${sourceLine}
            <p><a href="${EXPORT_REPO_URL}" target="_blank" rel="noopener noreferrer">Open official data export repository</a></p>
        </section>
    `;
}

function renderSidebarLastUpdated() {
    const host = document.getElementById('sidebarLastUpdatedHost');
    if (!host) return;

    host.innerHTML = `
        <details id="sidebarUpdateCard" class="wiki-sidebar-update-card" open>
            <summary>
                <span>Data Update Status</span>
            </summary>
            ${renderLastUpdatedSection('sidebar')}
        </details>
    `;
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
        
        a.href = `#${encodeURIComponent(item.id)}`;
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
        return;
    }

    renderWelcome(db.summary.loadedFiles);
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
    html += `<div class="wiki-meta-id">ID: ${escapeHtml(item.id)}</div>`;
    html += `<div class="wiki-meta-id">Source: ${escapeHtml(item.sourceFile)}</div>`;
    html += `</div>`;
    
    // Add raw properties as a structured table
    html += `<div class="wiki-card"><div class="wiki-properties">`;
    html += generateObjectHTML(item.data, { depth: 0 });
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
                if (refItem) html += `<li><a href="#${encodeURIComponent(refItem.id)}" class="wiki-link">${escapeHtml(refItem.title)}</a></li>`;
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

    if (typeof ref === 'string') {
        const direct = findByAlias(ref);
        if (direct) return direct;

        const withoutSuffix = ref.replace(/_\d+$/, '');
        const cleaned = withoutSuffix.replace(/\.[^/.]+$/, '');
        return findByAlias(cleaned);
    }

    if (isPlainObject(ref)) {
        if (asString(ref.name) && asString(ref.type)) {
            const byTypedName = findByAlias(`${ref.type}:${ref.name}`);
            if (byTypedName) return byTypedName;
        }

        if (asString(ref.name)) {
            return findByAlias(ref.name);
        }

        if (asString(ref.type) && Number.isInteger(ref.id)) {
            return findByAlias(`${ref.type}#${ref.id}`);
        }
    }

    return null;
}

function findByAlias(alias) {
    if (!alias) return null;
    const ids = db.aliases.get(normalizeAlias(alias));
    if (!ids || ids.size === 0) return null;

    const first = ids.values().next().value;
    return db.items.get(first) || null;
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
        const linkedItem = resolveItem(obj);
        if (linkedItem && linkedItem.id !== sourceId) {
            if (!db.references.has(linkedItem.id)) db.references.set(linkedItem.id, new Set());
            db.references.get(linkedItem.id).add(sourceId);
        }
        return;
    }

    if (typeof obj === 'object') {
        if (looksLikeTypedRef(obj)) {
            const linkedItem = resolveItem(obj);
            if (linkedItem && linkedItem.id !== sourceId) {
                if (!db.references.has(linkedItem.id)) db.references.set(linkedItem.id, new Set());
                db.references.get(linkedItem.id).add(sourceId);
            }
            return;
        }

        Object.values(obj).forEach(val => {
            if (typeof val === 'object' || typeof val === 'string') {
                extractReferences(val, sourceId);
            }
        });
    }
}

function looksLikeTypedRef(value) {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    return keys.length <= 4 && asString(value.name) && asString(value.type) && Number.isInteger(value.id);
}

/**
 * Sets up delegated mouse event listeners to handle interactive
 * curve hover inspection globally.
 */
function setupCurveInteractivity() {
    document.addEventListener('mousemove', (e) => {
        const svg = e.target.closest('.wiki-curve-svg');
        if (!svg) return;

        const container = svg.closest('.wiki-curve-container');
        const tooltip = container.querySelector('.curve-tooltip');
        const vLine = svg.querySelector('.curve-crosshair-v');
        const pt = svg.querySelector('.curve-crosshair-pt');

        if (!container.dataset.keys) return;
        const keys = JSON.parse(container.dataset.keys);
        const minTime = parseFloat(container.dataset.mintime);
        const maxTime = parseFloat(container.dataset.maxtime);
        const minVal = parseFloat(container.dataset.minval);
        const maxVal = parseFloat(container.dataset.maxval);

        // Match the SVG render dimensions
        const padding = 15;
        const width = 300;
        const height = 120;

        // Get mouse X relative to the SVG canvas
        const rect = svg.getBoundingClientRect();
        let mouseX = e.clientX - rect.left;
        mouseX = Math.max(padding, Math.min(width - padding, mouseX)); // Clamp to bounds

        // Map Mouse X position to Time (t)
        const t = minTime + ((mouseX - padding) / (width - 2 * padding)) * (maxTime - minTime);
        
        // Mathematically interpolate the Y value at this Time
        const val = evaluateHermite(keys, t);
        
        // Map actual Value back to Y visual coordinate
        const mouseY = height - padding - ((val - minVal) / (maxVal - minVal)) * (height - 2 * padding);

        // Update visual indicators
        vLine.setAttribute('x1', mouseX);
        vLine.setAttribute('x2', mouseX);
        vLine.setAttribute('opacity', '0.5');

        pt.setAttribute('cx', mouseX);
        pt.setAttribute('cy', mouseY);
        pt.setAttribute('opacity', '1');

        tooltip.innerHTML = `Time: ${t.toFixed(3)}<br>Val:&nbsp; ${val.toFixed(3)}`;
        tooltip.style.opacity = '1';
        
        // Flip tooltip to the left side if mouse gets too close to the right edge
        if (mouseX > width * 0.6) {
            tooltip.style.left = 'auto';
            tooltip.style.right = (width - mouseX + 15) + 'px';
        } else {
            tooltip.style.right = 'auto';
            tooltip.style.left = (mouseX + 15) + 'px';
        }
    });

    // Hide cursor tracking elements when the mouse leaves the SVG boundaries
    document.addEventListener('mouseout', (e) => {
        const svg = e.target.closest('.wiki-curve-svg');
        if (svg && !svg.contains(e.relatedTarget)) {
            const container = svg.closest('.wiki-curve-container');
            if (container) {
                container.querySelector('.curve-tooltip').style.opacity = '0';
                svg.querySelector('.curve-crosshair-v').setAttribute('opacity', '0');
                svg.querySelector('.curve-crosshair-pt').setAttribute('opacity', '0');
            }
        }
    });
}

/**
 * Core mathematics for evaluating a Cubic Hermite Spline at time `t`.
 * Accurately mimics Unity's `AnimationCurve.Evaluate(t)`.
 */
function evaluateHermite(keys, t) {
    if (!keys || keys.length === 0) return 0;
    if (t <= keys[0].time) return keys[0].value;
    if (t >= keys[keys.length - 1].time) return keys[keys.length - 1].value;

    for (let i = 0; i < keys.length - 1; i++) {
        let k0 = keys[i];
        let k1 = keys[i+1];
        if (t >= k0.time && t <= k1.time) {
            let dt = k1.time - k0.time;
            if (dt === 0) return k0.value;
            let u = (t - k0.time) / dt;
            
            // Hermite Basis Functions
            let h00 = 2 * u * u * u - 3 * u * u + 1;
            let h10 = u * u * u - 2 * u * u + u;
            let h01 = -2 * u * u * u + 3 * u * u;
            let h11 = u * u * u - u * u;
            
            // Scale tangents by time delta
            let m0 = k0.outSlope * dt;
            let m1 = k1.inSlope * dt;
            
            return h00 * k0.value + h10 * m0 + h01 * k1.value + h11 * m1;
        }
    }
    return 0;
}

/**
 * Generates an inline SVG visualizing a Unity AnimationCurve
 * Converts Unity's Hermite splines (slopes) to standard Cubic Bezier paths.
 */
function generateCurveSVG(keys) {
    if (!keys || keys.length === 0) return '<span class="value-empty">[ Empty Curve ]</span>';
    
    let minTime = keys[0].time;
    let maxTime = keys[keys.length - 1].time;
    let minValue = Math.min(...keys.map(k => k.value));
    let maxValue = Math.max(...keys.map(k => k.value));

    // Prevent division by zero for flat curves or single-keyframe curves
    if (minTime === maxTime) maxTime = minTime + 1;
    if (minValue === maxValue) {
        minValue -= 1;
        maxValue += 1;
    }

    const padding = 15;
    const width = 300;
    const height = 120;
    
    // Remap data to SVG coordinate space (Y is inverted in SVGs)
    const scaleX = (t) => padding + ((t - minTime) / (maxTime - minTime)) * (width - 2 * padding);
    const scaleY = (v) => height - padding - ((v - minValue) / (maxValue - minValue)) * (height - 2 * padding);

    let pathD = `M ${scaleX(keys[0].time).toFixed(2)} ${scaleY(keys[0].value).toFixed(2)}`;

    for (let i = 0; i < keys.length - 1; i++) {
        const k1 = keys[i];
        const k2 = keys[i+1];
        
        const dt = k2.time - k1.time;
        
        // Hermite to Bezier Control Point Conversion
        const cp1x = k1.time + (dt / 3);
        const cp1y = k1.value + (k1.outSlope * dt / 3);
        
        const cp2x = k2.time - (dt / 3);
        const cp2y = k2.value - (k2.inSlope * dt / 3);

        pathD += ` C ${scaleX(cp1x).toFixed(2)} ${scaleY(cp1y).toFixed(2)}, ${scaleX(cp2x).toFixed(2)} ${scaleY(cp2y).toFixed(2)}, ${scaleX(k2.time).toFixed(2)} ${scaleY(k2.value).toFixed(2)}`;
    }

    let pointsHtml = keys.map(k => `<circle cx="${scaleX(k.time).toFixed(2)}" cy="${scaleY(k.value).toFixed(2)}" r="3" fill="#4fc1ff" title="Time: ${k.time.toFixed(3)}\nValue: ${k.value.toFixed(3)}"/>`).join('');
    
    // Serialize curve data for the tooltip Javascript to read later
    const keysJson = JSON.stringify(keys).replace(/"/g, '&quot;');

    return `
    <div class="wiki-curve-container" style="background:#1e1e1e; border:1px solid #333; padding:5px; border-radius:6px; display:inline-block; margin-bottom: 10px; position:relative;" data-keys="${keysJson}" data-mintime="${minTime}" data-maxtime="${maxTime}" data-minval="${minValue}" data-maxval="${maxValue}">
        <svg class="wiki-curve-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="cursor: crosshair;">
            ${(minValue < 0 && maxValue > 0) ? `<line x1="0" y1="${scaleY(0)}" x2="${width}" y2="${scaleY(0)}" stroke="#444" stroke-width="1" stroke-dasharray="4" />` : ''}
            <path d="${pathD}" fill="none" stroke="#ce9178" stroke-width="2" stroke-linejoin="round"/>
            ${pointsHtml}
            <line class="curve-crosshair-v" x1="0" y1="0" x2="0" y2="${height}" stroke="#fff" stroke-width="1" stroke-dasharray="2" opacity="0" pointer-events="none"/>
            <circle class="curve-crosshair-pt" cx="0" cy="0" r="4" fill="#fff" opacity="0" pointer-events="none"/>
        </svg>
        <div class="curve-tooltip" style="position:absolute; top:5px; left:15px; background:rgba(0,0,0,0.8); border:1px solid #555; color:#fff; font-size:12px; padding:3px 6px; border-radius:4px; opacity:0; pointer-events:none; white-space:nowrap; z-index:10; font-family: monospace;"></div>
        <div style="display:flex; justify-content:space-between; font-size:0.85em; color:#858585; padding: 0 5px;">
            <span>${minTime.toFixed(2)}s</span>
            <span>${maxTime.toFixed(2)}s</span>
        </div>
    </div>`;
}

/**
 * Recursively converts a JSON object/array into nested HTML tables/lists.
 * Automatically hyperlinks GUIDs if they exist in our database or lookup.
 */
function generateObjectHTML(obj, context = { depth: 0 }) {
    if (obj === null || obj === undefined) return '<span class="value-null">null</span>';
    
    // Handle Primitive values
    if (typeof obj !== 'object') {
        if (typeof obj === 'string') {
            if (obj.trim() === '') return '<span class="value-empty">" "</span>';
            const linkedItem = resolveItem(obj);
            if (linkedItem) {
                return `<a href="#${encodeURIComponent(linkedItem.id)}" class="wiki-link">${escapeHtml(linkedItem.title)}</a>`;
            }

            if (/^Icon[A-Za-z0-9_]+$/.test(obj)) {
                return `<span class="icon-inline"><img src="../icons/${escapeHtml(obj)}.png" alt="${escapeHtml(obj)}" loading="lazy">${escapeHtml(obj)}</span>`;
            }
            return `<span class="value-string">"${escapeHtml(obj)}"</span>`;
        }
        if (typeof obj === 'boolean') return `<span class="value-bool">${obj}</span>`;
        if (typeof obj === 'number') return `<span class="value-number">${obj}</span>`;
        return `<span class="value-string">${escapeHtml(String(obj))}</span>`;
    }

    if (looksLikeTypedRef(obj)) {
        const linkedItem = resolveItem(obj);
        const label = `${obj.type}: ${obj.name} (#${obj.id})`;

        if (linkedItem) {
            return `<a href="#${encodeURIComponent(linkedItem.id)}" class="wiki-link unity-ref-link">${escapeHtml(label)}</a>`;
        }

        return `<span class="unity-ref">${escapeHtml(label)}</span>`;
    }

    // Handle Arrays
    if (Array.isArray(obj)) {
        if (obj.length === 0) return '<span class="value-empty">[ Empty ]</span>';
        
        // Detect if this array is a Unity Curve array (list of Keyframe objects)
        const isCurve = obj.length > 0 && obj.every(val => val !== null && typeof val === 'object' && 'time' in val && 'value' in val && 'inSlope' in val);
        if (isCurve) {
            let arrHtml = `<details class="wiki-array-container" open><summary class="wiki-array-summary">Animation Curve (${obj.length} keys)</summary>`;
            arrHtml += generateCurveSVG(obj);
            arrHtml += `<ul class="wiki-array">`;
            obj.forEach((val, index) => {
                arrHtml += `<li><span class="array-index">${index}:</span> ${generateObjectHTML(val, { depth: context.depth + 1 })}</li>`;
            });
            return arrHtml + '</ul></details>';
        }

        // Check if it's an array of simple primitives to display inline
        const isPrimitiveArray = obj.every(val => typeof val !== 'object' || val === null);
        if (isPrimitiveArray && obj.length <= 15) {
            return `<div class="wiki-array-inline">[ ${obj.map(val => generateObjectHTML(val, { depth: context.depth + 1 })).join(', ')} ]</div>`;
        }

        const isLocalizationArray = obj.every(
            (val) => isPlainObject(val) && typeof val.langCode === 'string' && typeof val.langTranslation === 'string'
        );
        if (isLocalizationArray) {
            const sorted = [...obj].sort((a, b) => {
                if (a.langCode === 'en') return -1;
                if (b.langCode === 'en') return 1;
                return a.langCode.localeCompare(b.langCode);
            });

            let locHtml = '<ul class="wiki-array wiki-localization">';
            sorted.forEach((entry) => {
                locHtml += `<li><span class="array-index">${escapeHtml(entry.langCode)}</span> ${escapeHtml(entry.langTranslation)}</li>`;
            });
            return `${locHtml}</ul>`;
        }

        const openAttr = obj.length <= 5 ? 'open' : '';
        let arrHtml = `<details class="wiki-array-container" ${openAttr}><summary class="wiki-array-summary">Array (${obj.length} items)</summary><ul class="wiki-array">`;
        obj.forEach((val, index) => {
            arrHtml += `<li><span class="array-index">${index}:</span> ${generateObjectHTML(val, { depth: context.depth + 1 })}</li>`;
        });
        return arrHtml + '</ul></details>';
    }

    const objKeys = Object.keys(obj);
    if (objKeys.length === 1 && ['_list', '_serializedList', 'array', 'entries'].includes(objKeys[0])) {
        if (Array.isArray(obj[objKeys[0]])) {
            return generateObjectHTML(obj[objKeys[0]], { depth: context.depth + 1 });
        }
    }

    let objHtml = '<table class="wiki-table"><tbody>';
    let hasRows = false;

    for (const [key, value] of Object.entries(obj)) {
        let valHtml = generateObjectHTML(value, { depth: context.depth + 1 });
        const keyClass = isNumericObjectKey(key) ? 'prop-key prop-key-compact' : 'prop-key';

        objHtml += `
            <tr>
                <th class="${keyClass}">${escapeHtml(key)}</th>
                <td class="prop-value">${valHtml}</td>
            </tr>
        `;
        hasRows = true;
    }
    
    if (!hasRows) return '<span class="value-empty">{ Empty Object }</span>';

    const tableHtml = objHtml + '</tbody></table>';
    const shouldCollapseObject = context.depth > 0 && objKeys.length > 5;
    if (!shouldCollapseObject) {
        return tableHtml;
    }

    return `<details class="wiki-object-container"><summary class="wiki-object-summary">Object (${objKeys.length} keys)</summary>${tableHtml}</details>`;
}

/**
 * Hooks up the search input box to filter the sidebar.
 */
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        const searchTerms = e.target.value.toLowerCase().trim().split(/\s+/);
        
        const filteredList = db.list.filter(item => {
            const title = item.title.toLowerCase();
            const id = item.id.toLowerCase();
            
            return searchTerms.every(term => title.includes(term) || id.includes(term));
        });
        buildSidebar(filteredList);
    });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isNumericObjectKey(key) {
    return /^\d+$/.test(String(key));
}