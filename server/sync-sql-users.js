// One-time / repeatable bulk sync: TanHiep SQL Server t_Users → vi_power MongoDB users
// Reuses the running server's /api/internal/sync-user endpoint (same upsert + dup-key
// fallback logic as the live UserBL webhook), so behavior stays identical to per-user syncs.
//
// Run on the server where this Node service lives:
//   node sync-sql-users.js
//
// Requires in .env:
//   SQL_HOST, SQL_DB, SQL_USER, SQL_PASSWORD   (TanHiep SQL Server)
//   INTERNAL_SECRET                            (already used by syncUser webhook)
//   PORT                                       (defaults to 3005)

require('dotenv').config();
const sql = require('mssql');
const http = require('http');

const SQL_CONFIG = {
    server: process.env.SQL_HOST,
    database: process.env.SQL_DB,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
};

const PORT = process.env.PORT || 3005;
const SECRET = process.env.INTERNAL_SECRET;

function syncOne(loraUsername, role) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ loraUsername, fullName: loraUsername, role, action: 'sync' });
        const req = http.request({
            hostname: 'localhost',
            port: PORT,
            path: '/api/internal/sync-user',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'X-Internal-Secret': SECRET,
            },
        }, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve({ loraUsername, status: res.statusCode, data }));
        });
        req.on('error', (err) => resolve({ loraUsername, error: err.message }));
        req.write(body);
        req.end();
    });
}

(async () => {
    if (!SQL_CONFIG.server || !SQL_CONFIG.database) {
        console.error('Missing SQL_HOST/SQL_DB in .env — set them then rerun.');
        process.exit(1);
    }

    console.log(`Connecting to SQL Server ${SQL_CONFIG.server}/${SQL_CONFIG.database} ...`);
    const pool = await sql.connect(SQL_CONFIG);

    const result = await pool.request().query('SELECT Username, Role, Active FROM t_Users');
    const rows = result.recordset;
    console.log(`Found ${rows.length} users in t_Users.`);

    let ok = 0, fail = 0;
    for (const row of rows) {
        if (!row.Username || !row.Role) continue;
        const r = await syncOne(row.Username, row.Role);
        if (r.error || r.status >= 400) {
            fail++;
            console.error(`✗ ${row.Username}:`, r.error || `HTTP ${r.status} ${r.data}`);
        } else {
            ok++;
            console.log(`✓ ${row.Username} (${row.Role})`);
        }
    }

    console.log(`\nDone: ${ok} synced, ${fail} failed.`);
    await pool.close();
    process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
