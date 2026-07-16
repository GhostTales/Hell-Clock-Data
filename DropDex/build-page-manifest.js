// /home/GhostTales/Code/GitHub/Hell-Clock-Data/DropDex/build-page-manifest.js
const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'Pages');
const manifestPath = path.join(pagesDir, 'page-manifest.json');
const dynamicDir = path.join(pagesDir, 'dynamic');

/**
 * Recursively finds all .txt files in a directory, ignoring specified subdirectories.
 * @param {string} dir - The directory to search.
 * @returns {string[]} An array of relative file paths.
 */
function findTxtFiles(dir) {
    let txtFiles = [];
    try {
        const items = fs.readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dir, item.name);

            // Skip the dynamic directory
            if (fullPath === dynamicDir) {
                continue;
            }

            if (item.isDirectory()) {
                txtFiles = txtFiles.concat(findTxtFiles(fullPath));
            } else if (path.extname(item.name) === '.txt') {
                // Get path relative to the 'Pages' directory
                const relativePath = path.relative(pagesDir, fullPath);
                txtFiles.push(relativePath);
            }
        }
    } catch (error) {
        // Ignore errors for directories that might not exist
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
    return txtFiles;
}

/**
 * Converts a camelCase or PascalCase string to a space-separated string.
 * e.g., 'MainPage' -> 'Main Page'
 * @param {string} s - The input string.
 * @returns {string} The converted string.
 */
function camelCaseToTitle(s) {
    return s.replace(/([A-Z])/g, ' $1').trim();
}

try {
    console.log('Building page manifest...');
    const txtFiles = findTxtFiles(pagesDir);

    const manifest = txtFiles.map(file => {
        // Use forward slashes for URL compatibility and remove the extension.
        const urlPath = file.replace(/\\/g, '/').replace(/\.txt$/, '');
        
        // Derive a user-friendly name from the filename.
        const baseName = path.basename(urlPath);
        let displayName = baseName.replace(/_/g, ' ');

        // Add spaces to PascalCase names for better readability
        if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(displayName)) {
            displayName = camelCaseToTitle(displayName);
        }

        return { name: displayName, path: urlPath };
    });

    // Sort manifest alphabetically by name for consistency.
    manifest.sort((a, b) => a.name.localeCompare(b.name));

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✅ Successfully created page manifest with ${manifest.length} pages at: ${manifestPath}`);

} catch (error) {
    console.error('❌ Failed to build page manifest:', error);
    process.exit(1); // Exit with an error code
}
