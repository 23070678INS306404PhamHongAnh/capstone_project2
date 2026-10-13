const path = require("node:path");
require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const express = require("express");
const mysql = require("mysql2/promise");

const app = express();
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/orders/pending", async (req, res) => {
  try {
    const [orders] = await pool.execute(`
      SELECT id, order_code, customer_name,
             total_amount, status, created_at
      FROM orders
      WHERE status = 'pending'
      ORDER BY created_at DESC, id DESC
    `);

    res.json({ data: orders });
  } catch (error) {
    console.error("Lỗi truy vấn đơn hàng:", error.code);
    res.status(500).json({
      message: "Không thể lấy danh sách đơn hàng.",
    });
  }
});

async function start() {
  try {
    await pool.query("SELECT 1");

    const port = Number(process.env.PORT || 3000);
    app.listen(port, process.env.HOST || "127.0.0.1", () => {
      console.log(`Backend đang chạy tại http://localhost:${port}`);
      console.log("Kết nối MySQL thành công.");
    });
  } catch (error) {
    console.error("Không thể kết nối MySQL:", error.code);
    await pool.end();
    process.exitCode = 1;
  }
}

start();