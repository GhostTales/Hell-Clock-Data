const shortToItemTypeMap = {
    r: 'relics',
    t: 'treasure_classes',
    d: 'dungeons',
};

const itemTypeToShortMap = Object.fromEntries(
    Object.entries(shortToItemTypeMap).map(([shortName, fullName]) => [fullName, shortName]),
);

function normalizeDynamicPage(pageName) {
    const pathParts = pageName.split('/');
    if (pathParts.length < 2) {
        return pageName;
    }

    const [itemType, ...rest] = pathParts;
    const canonicalItemType = shortToItemTypeMap[itemType] || itemType;
    return [canonicalItemType, ...rest].join('/');
}

function normalizePageName(pageName) {
    if (!pageName) {
        return 'MainPage';
    }

    if (pageName.includes('/')) {
        return normalizeDynamicPage(pageName);
    }

    return pageName;
}

function getUrlParams(input = '') {
    if (input instanceof URLSearchParams) {
        return input;
    }

    if (typeof input !== 'string') {
        return new URLSearchParams('');
    }

    const trimmed = input.startsWith('?') ? input.slice(1) : input;
    return new URLSearchParams(trimmed);
}

/**
 * Parses a route query string and returns canonical routing values.
 * Supports both short (?p=, ?q=) and legacy (?page=, ?query=) params.
 * @param {string|URLSearchParams} input - Query string or URLSearchParams.
 * @returns {{ pageName: string, query: string }} Canonical route values.
 */
export function parseRoute(input) {
    const params = getUrlParams(input);
    const rawPageName = params.get('p') || params.get('page') || 'MainPage';
    const pageName = normalizePageName(rawPageName);
    const query = params.get('q') || params.get('query') || '';

    return { pageName, query };
}

function shortenPageName(pageName) {
    if (!pageName.includes('/')) {
        return pageName;
    }

    const pathParts = pageName.split('/');
    const [itemType, ...rest] = pathParts;
    const shortItemType = itemTypeToShortMap[itemType] || itemType;
    return [shortItemType, ...rest].join('/');
}

function safeDecodeURIComponent(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function encodePagePath(pageName) {
    if (!pageName.includes('/')) {
        return encodeURIComponent(safeDecodeURIComponent(pageName));
    }

    const [itemType, ...rest] = pageName.split('/');
    const encodedRest = rest.map(segment => encodeURIComponent(safeDecodeURIComponent(segment)));
    return [encodeURIComponent(safeDecodeURIComponent(itemType)), ...encodedRest].join('/');
}

/**
 * Builds a compact DropDex URL query string.
 * @param {string} pageName - Canonical page name.
 * @param {{q?: string}} [options={}] - Optional extra route params.
 * @returns {string} Query string such as '?p=r/Tempest' or '?p=Search&q=Tempest'.
 */
export function buildPageHref(pageName, options = {}) {
    const shortPageName = shortenPageName(pageName);
    const encodedPagePath = encodePagePath(shortPageName);

    let href = `?p=${encodedPagePath}`;
    if (options.q) {
        href += `&q=${encodeURIComponent(options.q)}`;
    }

    return href;
}

/**
 * Returns true when href is an internal DropDex route.
 * @param {string|null} href - Anchor href attribute.
 * @returns {boolean} True when this should be handled by SPA navigation.
 */
export function isInternalRouteHref(href) {
    if (!href) {
        return false;
    }

    return href.startsWith('?p=') || href.startsWith('?page=');
}