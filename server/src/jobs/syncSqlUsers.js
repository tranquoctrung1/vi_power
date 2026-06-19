// Periodic sync: TanHiep SQL Server t_Users → vi_power MongoDB users.
// Runs in-process so it ships inside the pkg exe (no separate node_modules on server).
const sql = require('mssql');
const UserModel = require('../models/User');

function mapRole(loraRole) {
    return loraRole === 'admin' ? 'Admin' : 'Viewer';
}

const SQL_CONFIG = {
    server: process.env.SQL_HOST,
    database: process.env.SQL_DB,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
};

let running = false;

async function syncOnce() {
    if (running) return; // skip overlap if a previous run is still going
    if (!SQL_CONFIG.server || !SQL_CONFIG.database) {
        console.warn('[syncSqlUsers] Missing SQL_HOST/SQL_DB in .env — skip');
        return;
    }

    running = true;
    let pool;
    try {
        pool = await sql.connect(SQL_CONFIG);
        const result = await pool.request().query('SELECT Username, Role FROM t_Users');
        const rows = result.recordset;

        let ok = 0, fail = 0;
        for (const row of rows) {
            if (!row.Username || !row.Role) continue;
            try {
                await UserModel.upsertFromLora({
                    loraUsername: row.Username,
                    fullName: row.Username,
                    role: mapRole(row.Role),
                });
                ok++;
            } catch (err) {
                fail++;
                console.error(`[syncSqlUsers] ${row.Username} failed:`, err.message);
            }
        }
        console.log(`[syncSqlUsers] synced ${ok}/${rows.length} users (${fail} failed)`);
    } catch (err) {
        console.error('[syncSqlUsers] error:', err.message);
    } finally {
        if (pool) await pool.close().catch(() => {});
        running = false;
    }
}

function start(intervalMs = 5 * 60 * 1000) {
    syncOnce(); // run once at startup
    setInterval(syncOnce, intervalMs);
}

module.exports = { start, syncOnce };
