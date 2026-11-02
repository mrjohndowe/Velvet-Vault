@'
require("dotenv").config({ path: ".env.local" });

const { drizzle } = require("drizzle-orm/node-postgres");
const { Pool } = require("pg");

(async () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    try {
        const db = drizzle(pool);

        const result = await db.execute(
            "SELECT current_database(), current_user"
        );

        console.log("DRIZZLE CONNECTION: SUCCESS");
        console.log(result);

    } catch (error) {
        console.error("DRIZZLE CONNECTION: FAILED");
        console.error(error);

    } finally {
        await pool.end();
    }
})();
'@ | Set-Content -Encoding UTF8 .\test-drizzle.js