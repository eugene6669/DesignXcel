'use strict';

/**
 * Remove files under backend/public/uploads that are not referenced in the DB or theme JSON.
 *
 * Usage:
 *   node scripts/cleanup-unused-uploads.js           # dry run (default)
 *   node scripts/cleanup-unused-uploads.js --delete  # delete unused files
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const {
    buildProductAssetUrlCandidates,
    sanitizeRelativeUploadPath
} = require('../utils/productAssetUrls');
const { blobPathFromAssetUrl } = require('../utils/azureBlobStorage');

const UPLOADS_ROOT = path.join(__dirname, '..', 'public', 'uploads');
const DELETE = process.argv.includes('--delete');

function parseConnectionString(connectionString) {
    const config = { options: { enableArithAbort: true } };
    connectionString.split(';').filter(Boolean).forEach((part) => {
        const eq = part.indexOf('=');
        if (eq === -1) return;
        const key = part.slice(0, eq).trim().toLowerCase();
        const value = part.slice(eq + 1).trim();
        if (key === 'server') config.server = value;
        else if (key === 'database') config.database = value;
        else if (key === 'user id' || key === 'uid') config.user = value;
        else if (key === 'password' || key === 'pwd') config.password = value;
        else if (key === 'encrypt') config.options.encrypt = value.toLowerCase() === 'true';
        else if (key === 'trustservercertificate') config.options.trustServerCertificate = value.toLowerCase() === 'true';
    });
    return config;
}

function getDbConfig() {
    if (process.env.DB_CONNECTION_STRING) {
        const parsed = parseConnectionString(process.env.DB_CONNECTION_STRING);
        return {
            ...parsed,
            options: {
                encrypt: parsed.options?.encrypt ?? process.env.NODE_ENV === 'production',
                trustServerCertificate: parsed.options?.trustServerCertificate ?? process.env.NODE_ENV !== 'production',
                enableArithAbort: true
            },
            requestTimeout: 60000,
            connectionTimeout: 30000
        };
    }
    return {
        server: process.env.DB_SERVER || 'DESKTOP-F4OI6BT\\SQLEXPRESS',
        user: process.env.DB_USERNAME || 'DesignXcel',
        password: process.env.DB_PASSWORD || 'Azwrathfrozen22@',
        database: process.env.DB_DATABASE || 'DesignXcellDB',
        options: {
            encrypt: process.env.DB_ENCRYPT === 'true' || process.env.NODE_ENV === 'production',
            trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || process.env.NODE_ENV !== 'production',
            enableArithAbort: true
        },
        requestTimeout: 60000,
        connectionTimeout: 30000
    };
}

function collectUrlsFromText(value, out) {
    if (value == null) return;
    const str = String(value).trim();
    if (!str) return;

    const blob = blobPathFromAssetUrl(str);
    if (blob) out.add(`/uploads/${blob.replace(/\\/g, '/')}`);

    let idx = str.indexOf('/uploads/');
    while (idx !== -1) {
        const slice = str.slice(idx).split(/[\s"'`,\]}]+/)[0].split('?')[0].split('#')[0];
        if (slice.startsWith('/uploads/')) out.add(slice);
        idx = str.indexOf('/uploads/', idx + 1);
    }

    if (str.startsWith('uploads/')) {
        out.add(`/${str.split(/[\s"'`,]+/)[0].split('?')[0]}`);
    }

    if (str.startsWith('[') || str.startsWith('{')) {
        try {
            collectUrlsFromJson(JSON.parse(str), out);
        } catch (_) {
            /* not JSON */
        }
    }
}

function collectUrlsFromJson(value, out) {
    if (value == null) return;
    if (Array.isArray(value)) {
        value.forEach((item) => collectUrlsFromJson(item, out));
        return;
    }
    if (typeof value === 'object') {
        Object.values(value).forEach((item) => collectUrlsFromJson(item, out));
        return;
    }
    collectUrlsFromText(value, out);
}

function uploadUrlToAbsoluteDiskPaths(uploadUrl) {
    const paths = new Set();
    const sanitized = sanitizeRelativeUploadPath(uploadUrl);
    const candidates = sanitized ? buildProductAssetUrlCandidates(sanitized) : [];
    if (sanitized && sanitized.startsWith('/uploads/')) candidates.unshift(sanitized);

    for (const candidate of candidates) {
        if (!candidate || !candidate.startsWith('/uploads/')) continue;
        paths.add(path.join(UPLOADS_ROOT, candidate.replace(/^\/uploads\//, '').replace(/\//g, path.sep)));
    }
    return paths;
}

async function tableExists(pool, tableName) {
    const result = await pool.request()
        .input('tableName', sql.NVarChar, tableName)
        .query(`
            SELECT 1 AS ok
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME = @tableName
        `);
    return result.recordset.length > 0;
}

async function columnExists(pool, tableName, columnName) {
    const result = await pool.request()
        .input('tableName', sql.NVarChar, tableName)
        .input('columnName', sql.NVarChar, columnName)
        .query(`
            SELECT 1 AS ok
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
        `);
    return result.recordset.length > 0;
}

async function collectDbUploadUrls(pool) {
    const urlSet = new Set();
    const addRowValues = (rows, columns) => {
        for (const row of rows) {
            for (const col of columns) {
                collectUrlsFromText(row[col], urlSet);
            }
        }
    };

    const tableColumns = [
        ['Products', ['ImageURL', 'ThumbnailURLs', 'Model3DURL']],
        ['InventoryProducts', ['ImageURL', 'ThumbnailURLs', 'Model3D']],
        ['ProductVariations', ['VariationImageURL', 'ThumbnailURLs', 'Model3D']],
        ['InventoryProductVariations', ['VariationImageURL', 'ThumbnailURLs', 'Model3D']],
        ['Orders', ['ReturnImageURL', 'ReturnVideoURL', 'ProofOfPurchaseImageURL']],
        ['Customers', ['ProfileImage']],
        ['Users', ['ProfileImage']],
        ['HeaderBanner', ['LogoURL']],
        ['HeroBanner', ['HeroBannerImages']],
        ['ProductReviews', ['ImageURL', 'ImageURLs']],
        ['project_items', ['main_image_url']],
        ['project_thumbnails', ['image_url']]
    ];

    for (const [table, columns] of tableColumns) {
        if (!(await tableExists(pool, table))) continue;
        const existingCols = [];
        for (const col of columns) {
            if (await columnExists(pool, table, col)) existingCols.push(col);
        }
        if (!existingCols.length) continue;
        const result = await pool.request().query(`SELECT ${existingCols.map((c) => `[${c}]`).join(', ')} FROM [${table}]`);
        addRowValues(result.recordset, existingCols);
        console.log(`  ${table}: scanned ${result.recordset.length} row(s)`);
    }

    const themePath = path.join(__dirname, '..', 'data', 'theme-settings.json');
    if (fs.existsSync(themePath)) {
        collectUrlsFromJson(JSON.parse(fs.readFileSync(themePath, 'utf8')), urlSet);
        console.log('  theme-settings.json: scanned');
    }

    return urlSet;
}

function listAllUploadFiles(root) {
    const files = [];
    if (!fs.existsSync(root)) return files;
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else files.push(full);
        }
    };
    walk(root);
    return files;
}

async function main() {
    console.log(DELETE ? 'Deleting unused upload files...\n' : 'Dry run — unused upload files (pass --delete to remove):\n');

    const pool = await sql.connect(getDbConfig());
    try {
        console.log('Collecting referenced upload URLs from database...');
        const referencedUrls = await collectDbUploadUrls(pool);
        console.log(`Found ${referencedUrls.size} unique upload URL reference(s)\n`);

        const usedAbsolutePaths = new Set();
        for (const url of referencedUrls) {
            for (const abs of uploadUrlToAbsoluteDiskPaths(url)) {
                usedAbsolutePaths.add(path.normalize(abs).toLowerCase());
            }
        }

        const allFiles = listAllUploadFiles(UPLOADS_ROOT);
        const unused = [];
        const used = [];

        for (const filePath of allFiles) {
            const key = path.normalize(filePath).toLowerCase();
            if (usedAbsolutePaths.has(key)) used.push(filePath);
            else unused.push(filePath);
        }

        console.log(`Total files on disk: ${allFiles.length}`);
        console.log(`Referenced (kept):   ${used.length}`);
        console.log(`Unused:              ${unused.length}\n`);

        if (unused.length) {
            console.log('Unused files:');
            unused.forEach((f) => console.log('  -', path.relative(UPLOADS_ROOT, f)));
        } else {
            console.log('No unused files found.');
        }

        if (DELETE && unused.length) {
            let deleted = 0;
            for (const filePath of unused) {
                try {
                    fs.unlinkSync(filePath);
                    deleted++;
                } catch (err) {
                    console.error(`Failed to delete ${filePath}:`, err.message);
                }
            }
            console.log(`\nDeleted ${deleted} file(s).`);
        } else if (!DELETE && unused.length) {
            console.log('\nRe-run with --delete to remove these files.');
        }
    } finally {
        await pool.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
