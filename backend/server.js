const path = require("node:path");
const express = require("express");
const { pool } = require("./src/db");
const ordersRouter = require("./src/orders");

const app = express();

app.use(express.json());
app.use("/api/orders", ordersRouter);
app.use(express.static(path.join(__dirname, "public")));

async function start() {
  try {
    await pool.query("SELECT 1");

    const port = Number(process.env.PORT || 3000);
    const host = process.env.HOST || "127.0.0.1";

    const server = app.listen(port, host, () => {
      console.log(`Server running on port ${port}.`);
      console.log("MySQL connected successfully.");
    });

    server.on("error", async (error) => {
      console.error("Server failed to start:", error.code);
      await pool.end();
      process.exitCode = 1;
    });
  } catch (error) {
    console.error("MySQL connection failed:", error.code);
    await pool.end();
    process.exitCode = 1;
  }
}

start();