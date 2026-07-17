import { getGameData } from './data.js';
import { getEnLoc } from './templates.js';
import { parseContent } from './parser.js';
import { initializeSearch, buildSearchIndex } from './search.js';

/**
 * Calculates the Levenshtein distance between two strings.
 * @param {string} a The first string.
 * @param {string} b The second string.
 * @returns {number} The Levenshtein distance.
 */
function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i += 1) {
        matrix[0][i] = i;
    }

    for (let j = 0; j <= b.length; j += 1) {
        matrix[j][0] = j;
    }

    for (let j = 1; j <= b.length; j += 1) {
        for (let i = 1; i <= a.length; i += 1) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1, // deletion
                matrix[j - 1][i] + 1, // insertion
                matrix[j - 1][i - 1] + indicator, // substitution
            );
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Debounce function to limit how often a function can be called.
 * @param {Function} func The function to debounce.
 * @param {number} delay The delay in milliseconds.
 * @returns {Function} The new debounced function.
 */
function debounce(func, delay) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, delay);
    };
}

/**
 * Loads a DropDex page, parses it, and injects it into the main content area.
 * @param {string} pageName - The name of the page to load (e.g., 'Main_Page').
 * @param {object} [options={}] - Optional parameters.
 * @param {boolean} [options.isDevotionUpdate=false] - Flag for a less disruptive reload.
 */
async function loadPage(pageName, options = {}) {
    const mainContent = document.getElementById('mainContent');
    let pageTitle = pageName.replace(/_/g, ' ');

    // For devotion updates, show a subtle loading state and don't clear the header
    if (options.isDevotionUpdate) {
        const pageContent = document.getElementById('pageContent');
        if (pageContent) {
            pageContent.style.opacity = '0.5';
        }
    } else {
        // For full page loads, show the loading message
        mainContent.innerHTML = `<h1>Loading ${pageTitle}...</h1>`;
    }

    let textContent;
    let extraContextForParser = {};

    if (pageName === 'MainPage') {
        try {
            const response = await fetch('https://api.github.com/repos/RogueSnail/hellclock-data-export/commits?per_page=1');
            if (response.ok) {
                const commits = await response.json();
                if (commits && commits.length > 0) {
                    const lastCommitDate = new Date(commits[0].commit.committer.date);
                    extraContextForParser.lastUpdateDate = lastCommitDate.toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'UTC',
                        timeZoneName: 'short'
                    });
                } else {
                    extraContextForParser.lastUpdateDate = "Could not be determined.";
                }
            } else {
                extraContextForParser.lastUpdateDate = `Could not be determined (API status: ${response.status}).`;
            }
        } catch (error) {
            console.error('Failed to fetch last update date from GitHub:', error);
            extraContextForParser.lastUpdateDate = "Could not be determined (network error).";
        }
    }
    const dynamicItemTypes = ['relics', 'treasure_classes', 'dungeons'];

    try {
        if (pageName === 'Search') {
            const urlParams = new URLSearchParams(window.location.search);
            const query = urlParams.get('query') || '';
            pageTitle = `Search results for "${query}"`;

            const searchIndex = await buildSearchIndex();

            const searchTerms = query.toLowerCase().split(' ').filter(t => t.length > 0);
            let filtered = [];

            if (searchTerms.length > 0) {
                filtered = searchIndex.filter(item => {
                    const itemName = item.name.toLowerCase();
                    return searchTerms.every(term => itemName.includes(term));
                });
            }

            let suggestionHtml = '';

            // If no direct results, try to find a close match for typos
            if (filtered.length === 0 && query.length > 3) {
                let bestMatch = null;
                let minDistance = Infinity;
                const queryLower = query.toLowerCase();

                searchIndex.forEach(item => {
                    const itemName = item.name.toLowerCase();
                    let distance = getLevenshteinDistance(queryLower, itemName);

                    // For partial queries, also check against the beginning of the item name
                    // to handle prefix typos like "blind" for "blunderbuss".
                    if (itemName.length > queryLower.length) {
                        const prefixDistance = getLevenshteinDistance(queryLower, itemName.substring(0, queryLower.length));
                        distance = Math.min(distance, prefixDistance);
                    }

                    if (distance < minDistance) {
                        minDistance = distance;
                        bestMatch = item;
                    }
                });

                // Only suggest if the match is reasonably close.
                const threshold = Math.max(2, Math.floor(query.length / 3));
                if (bestMatch && minDistance <= threshold) {
                    suggestionHtml = `<div class="search-suggestion">Did you mean: <a href="?page=Search&query=${encodeURIComponent(bestMatch.name)}">${bestMatch.name}</a>?</div>`;
                    const suggestedTerms = bestMatch.name.toLowerCase().split(' ').filter(t => t.length > 0);
                    filtered = searchIndex.filter(item => {
                        const currentItemName = item.name.toLowerCase();
                        return suggestedTerms.every(term => currentItemName.includes(term));
                    });
                }
            }

            let resultsHtml = '<ul class="search-results-list">';
            if (filtered.length > 0) {
                filtered.forEach(item => {
                    resultsHtml += `<li><a href="${item.url}">${item.name}</a></li>`;
                });
            } else {
                resultsHtml += '<li>No results found.</li>';
            }
            resultsHtml += '</ul>';

            mainContent.innerHTML = `
                <div class="page-header">
                    <h1>${pageTitle}</h1>
                </div>
                <div id="pageContent">${suggestionHtml}${resultsHtml}</div>`;

            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = query;
            }
            return;
        }

        const pathParts = pageName.split('/');
        const isDynamic = dynamicItemTypes.includes(pathParts[0]) && pathParts.length > 1;

        if (isDynamic) {
            // Handle dynamic pages (relics, treasure classes, etc.)
            const itemType = pathParts[0];
            const encodedItemName = pathParts.slice(1).join('/');
            const itemTitle = decodeURIComponent(encodedItemName);
            pageTitle = itemTitle;
            extraContextForParser = { itemTitle };

            let dynamicTemplatePath;
            if (itemType === 'relics') {
                dynamicTemplatePath = 'Pages/dynamic/relic.ejs';
            } else if (itemType === 'treasure_classes') {
                dynamicTemplatePath = 'Pages/dynamic/treasure_class.ejs';
            } else if (itemType === 'dungeons') {
                dynamicTemplatePath = 'Pages/dynamic/dungeon.ejs';
            } // No else needed due to 'isDynamic' check

            const templateResponse = await fetch(dynamicTemplatePath);
            if (!templateResponse.ok) throw new Error(`Dynamic template not found: ${dynamicTemplatePath}`);
            textContent = await templateResponse.text();
        } else {
            // Handle static pages
            const staticResponse = await fetch(`Pages/${pageName}.txt`);
            if (!staticResponse.ok) throw new Error(`Page not found: ${pageName}`);
            textContent = await staticResponse.text();
            pageTitle = pageName.replace(/_/g, ' ').split('/').pop();
        }

        const parsedHtml = await parseContent(textContent, extraContextForParser);

        // Intelligently update the DOM to prevent flashing on devotion changes
        const pageContentEl = document.getElementById('pageContent');
        if (options.isDevotionUpdate && pageContentEl) {
            // Soft update: only replace the content div
            pageContentEl.innerHTML = parsedHtml;
            pageContentEl.style.opacity = '1';
        } else {
            // Hard update: replace the whole main content area
            mainContent.innerHTML = `
                <div class="page-header">
                    <h1>${pageTitle}</h1>
                    <button id="viewSourceBtn" class="tool-button">View Source</button>
                </div>
                <div id="pageContent">${parsedHtml}</div>`;

            document.getElementById('viewSourceBtn').addEventListener('click', () => {
                const pageContent = document.getElementById('pageContent');
                const btn = document.getElementById('viewSourceBtn');
                if (btn.textContent === 'View Source') {
                    pageContent.innerHTML = `<pre class="source-view"><code></code></pre>`;
                    pageContent.querySelector('code').textContent = textContent;
                    btn.textContent = 'View Page';
                } else {
                    pageContent.innerHTML = parsedHtml;
                    btn.textContent = 'View Source';
                }
            });
        }

    } catch (error) {
        console.error('Failed to load page:', error);
        mainContent.innerHTML = `
            <h1>Error</h1>
            <p>Could not load page '<strong>${pageTitle}</strong>'.</p>
            <p>Please check that the URL is correct and that a corresponding item exists or a manual page has been created at <code>/Pages/${pageName}.txt</code>.</p>
        `;
    }
}

/**
 * Initializes the DropDex router and loads the correct page.
 */
function initialize() {
    const devotionInputs = ['furyPoints', 'faithPoints', 'disciplinePoints'];

    // Create a debounced version of the page loader for devotion updates
    const debouncedLoadPageForDevotion = debounce(() => {
        const currentUrlParams = new URLSearchParams(window.location.search);
        const currentPageName = currentUrlParams.get('page') || 'Main_Page';
        // Call loadPage with a flag to indicate a soft-reload
        loadPage(currentPageName, { isDevotionUpdate: true });
    }, 400); // 400ms delay

    // Set up devotion inputs to persist across page loads
    devotionInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            // On page load, restore the value from sessionStorage
            const savedValue = sessionStorage.getItem(id);
            if (savedValue !== null) input.value = savedValue;

            // When the input changes (typing or arrows), save the new value and trigger a debounced reload
            input.addEventListener('input', (event) => {
                sessionStorage.setItem(id, event.target.value);
                debouncedLoadPageForDevotion();
            });
        }
    });

    // Now that inputs are restored, load the page content and search
    const urlParams = new URLSearchParams(window.location.search);
    const pageName = urlParams.get('page') || 'Main_Page'; // Default to Main_Page
    loadPage(pageName);
    initializeSearch();
}

// Run the initializer when the DOM is ready
document.addEventListener('DOMContentLoaded', initialize);