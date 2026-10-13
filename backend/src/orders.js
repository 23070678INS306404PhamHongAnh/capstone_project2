const express = require("express");
const { pool } = require("./db");

const router = express.Router();

// Get pending orders.
router.get("/pending", async (req, res) => {
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
    console.error("Pending orders query failed:", error.code);
    res.status(500).json({
      message: "Unable to retrieve pending orders.",
    });
  }
});

// Get all orders.
router.get("/", async (req, res) => {
  try {
    const [orders] = await pool.execute(`
      SELECT id, order_code, customer_name,
             total_amount, status, created_at
      FROM orders
      ORDER BY created_at DESC, id DESC
    `);

    res.json({ data: orders });
  } catch (error) {
    console.error("Orders query failed:", error.code);
    res.status(500).json({
      message: "Unable to retrieve orders.",
    });
  }
});

// Create an order.
router.post("/", async (req, res) => {
  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      message: "A valid order is required.",
    });
  }

  const fields = [
    ["order_code", "Order code", 30],
    ["customer_name", "Customer name", 100],
    ["customer_phone", "Customer phone", 20],
    ["delivery_address", "Delivery address", 255],
  ];

  const values = {};

  for (const [key, label, maxLength] of fields) {
    if (
      typeof body[key] !== "string" ||
      !body[key].trim() ||
      body[key].trim().length > maxLength
    ) {
      return res.status(400).json({
        message: `${label} must contain 1–${maxLength} characters.`,
      });
    }

    values[key] = body[key].trim();
  }

  if (
    !/^[A-Za-z0-9_-]+$/.test(values.order_code)
  ) {
    return res.status(400).json({
      message: "Order code can contain only letters, numbers, - and _.",
    });
  }

  if (!/^\+?[0-9]{8,15}$/.test(values.customer_phone)) {
    return res.status(400).json({
      message: "Phone must contain 8–15 digits, optionally starting with +.",
    });
  }

  const rawAmount = body.total_amount;

  if (
    !["number", "string"].includes(typeof rawAmount) ||
    String(rawAmount).trim() === ""
  ) {
    return res.status(400).json({
      message: "Total amount is required.",
    });
  }

  const totalAmount = Number(rawAmount);

  if (
    !Number.isSafeInteger(totalAmount) ||
    totalAmount < 0 ||
    totalAmount > 1000000000
  ) {
    return res.status(400).json({
      message: "Total amount must be a whole VND amount from 0 to 1,000,000,000.",
    });
  }

  try {
    const [result] = await pool.execute(
      `
        INSERT INTO orders (
          order_code,
          customer_name,
          customer_phone,
          delivery_address,
          total_amount,
          status
        )
        VALUES (?, ?, ?, ?, ?, 'pending')
      `,
      [
        values.order_code,
        values.customer_name,
        values.customer_phone,
        values.delivery_address,
        totalAmount,
      ]
    );

    res.status(201).json({
      message: "Order created successfully.",
      data: {
        id: result.insertId,
        ...values,
        total_amount: totalAmount,
        status: "pending",
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "This order code already exists.",
      });
    }

    console.error("Order creation failed:", error.code);
    res.status(500).json({
      message: "Unable to create the order.",
    });
  }
});

// Get order details.
router.get("/:id", async (req, res) => {
  const orderId = Number(req.params.id);

  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      message: "Invalid order ID.",
    });
  }

  try {
    const [orders] = await pool.execute(
      `
        SELECT id, order_code, customer_name,
               customer_phone, delivery_address,
               total_amount, status, created_at
        FROM orders
        WHERE id = ?
      `,
      [orderId]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        message: "Order not found.",
      });
    }

    res.json({ data: orders[0] });
  } catch (error) {
    console.error("Order details query failed:", error.code);
    res.status(500).json({
      message: "Unable to retrieve order details.",
    });
  }
});

module.exports = router;