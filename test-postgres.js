require("dotenv").config({ path: ".env.local" });

const { Client } = require("pg");

(async () => {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();

        console.log("NODE POSTGRES CONNECTION: SUCCESS");

        const result = await client.query(
            "SELECT version(), current_database(), current_user"
        );

        console.log(result.rows[0]);

    } catch (error) {
        console.error("NODE POSTGRES CONNECTION: FAILED");
        console.error("Error:", error.message);
        console.error("Code:", error.code);

    } finally {
        await client.end().catch(() => {});
    }
})();
