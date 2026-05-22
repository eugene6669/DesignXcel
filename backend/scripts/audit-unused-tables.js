/**
 * Lists SQL Server tables and checks how often each is referenced in app code.
 * Run from backend/: node scripts/audit-unused-tables.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.development') });
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

function parseConnectionString(connectionString) {
    const config = {};
    connectionString.split(';').forEach((part) => {
        const [key, value] = part.split('=').map((s) => s.trim());
        if (!key || !value) return;
        switch (key.toLowerCase()) {
            case 'server': config.server = value; break;
            case 'database': config.database = value; break;
            case 'user id':
            case 'uid': config.user = value; break;
            case 'password':
            case 'pwd': config.password = value; break;
            case 'encrypt':
                config.options = config.options || {};
                config.options.encrypt = value.toLowerCase() === 'true';
                break;
            case 'trustservercertificate':
                config.options = config.options || {};
                config.options.trustServerCertificate = value.toLowerCase() === 'true';
                break;
            default: break;
        }
    });
    return config;
}

function getDbConfig() {
    const connectionString = process.env.DB_CONNECTION_STRING;
    if (connectionString) {
        const parsed = parseConnectionString(connectionString);
        return {
            ...parsed,
            options: {
                encrypt: parsed.options?.encrypt ?? (process.env.NODE_ENV === 'production'),
                trustServerCertificate: parsed.options?.trustServerCertificate ?? (process.env.NODE_ENV !== 'production'),
                enableArithAbort: true
            },
            requestTimeout: 60000,
            connectionTimeout: 30000
        };
    }
    return {
        server: process.env.DB_SERVER || 'DESKTOP-F4OI6BT\\SQLEXPRESS',
        user: process.env.DB_USERNAME || 'DesignXcel',
        password: process.env.DB_PASSWORD || '',
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

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = [ROOT, path.join(ROOT, '..', 'frontend')].filter((d) => fs.existsSync(d));
const EXT = new Set(['.js', '.ejs', '.sql', '.ts', '.tsx', '.jsx', '.vue', '.html']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.cursor']);

function walkFiles(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            if (SKIP_DIRS.has(name)) continue;
            walkFiles(full, out);
        } else if (EXT.has(path.extname(name).toLowerCase())) {
            out.push(full);
        }
    }
    return out;
}

function countTableRefs(tableName, files, contents) {
    const patterns = [
        new RegExp('\\b' + tableName + '\\b', 'gi'),
        new RegExp('\\bdbo\\.' + tableName + '\\b', 'gi')
    ];
    let hits = 0;
    const sampleFiles = [];
    for (let i = 0; i < files.length; i++) {
        const text = contents[i];
        let fileHits = 0;
        for (const re of patterns) {
            const m = text.match(re);
            if (m) fileHits += m.length;
        }
        if (fileHits > 0) {
            hits += fileHits;
            if (sampleFiles.length < 3) sampleFiles.push(path.relative(path.join(ROOT, '..'), files[i]));
        }
    }
    return { hits, sampleFiles };
}

async function main() {
    const dbConfig = getDbConfig();
    console.log('Database:', dbConfig.database, '@', dbConfig.server);

    const pool = await sql.connect(dbConfig);
    const tablesResult = await pool.request().query(`
        SELECT t.TABLE_SCHEMA, t.TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES t
        WHERE t.TABLE_TYPE = 'BASE TABLE'
          AND t.TABLE_SCHEMA NOT IN ('sys')
        ORDER BY t.TABLE_NAME
    `);

    const files = [];
    const contents = [];
    for (const dir of SCAN_DIRS) {
        for (const f of walkFiles(dir)) {
            files.push(f);
            contents.push(fs.readFileSync(f, 'utf8'));
        }
    }
    console.log('Scanned', files.length, 'source files\n');

    const rows = [];
    for (const row of tablesResult.recordset) {
        const name = row.TABLE_NAME;
        const { hits, sampleFiles } = countTableRefs(name, files, contents);
        rows.push({ schema: row.TABLE_SCHEMA, name, hits, sampleFiles });
    }

    await pool.close();

    const unused = rows.filter((r) => r.hits === 0);
    const lowUse = rows.filter((r) => r.hits > 0 && r.hits <= 2);

    console.log('=== Likely UNUSED (0 references in codebase) ===');
    if (!unused.length) console.log('(none)');
    unused.forEach((r) => console.log(' -', r.schema + '.' + r.name));

    console.log('\n=== Low use (1–2 references — verify manually) ===');
    if (!lowUse.length) console.log('(none)');
    lowUse.forEach((r) => {
        console.log(' -', r.schema + '.' + r.name, '(' + r.hits + ')', r.sampleFiles.join(', '));
    });

    console.log('\n=== All tables (reference count) ===');
    rows.forEach((r) => {
        const flag = r.hits === 0 ? 'UNUSED' : r.hits <= 2 ? 'LOW' : 'OK';
        console.log(String(r.hits).padStart(4), flag.padEnd(6), r.name);
    });
    console.log('\nTotal tables:', rows.length);
}

main().catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
});
