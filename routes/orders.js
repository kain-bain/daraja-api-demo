const express = require("express");
const crypto = require("crypto");
const { requireApiKey, writeLimiter } = require("../middleware");
const { formatKenyanPhone } = require("../daraja");

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 150000;

/**
 * Build the orders router bound to a database instance.
 */
function ordersRouter(db) {
  const router = express.Router();

  // ---- Validation helpers ------------------------------------------------

  function validateOrderPayload({ phone, amount }) {
    const normalizedPhone = formatKenyanPhone(phone);
    if (!normalizedPhone) {
      return { error: "A valid Kenyan phone number is required" };
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || !Number.isInteger(numericAmount)) {
      return { error: "Amount must be a whole number" };
    }
    if (numericAmount < MIN_AMOUNT || numericAmount > MAX_AMOUNT) {
      return {
        error: `Amount must be between ${MIN_AMOUNT} and ${MAX_AMOUNT} KES`,
      };
    }

    return { normalizedPhone, amount: numericAmount };
  }

  // ---- Create ------------------------------------------------------------

  router.post("/", requireApiKey, writeLimiter, (req, res) => {
    const { reference, phone, amount } = req.body || {};

    const validation = validateOrderPayload({ phone, amount });
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    // Idempotency: reuse an existing order when the same reference is posted.
    if (reference) {
      const existing = db
        .prepare("SELECT * FROM orders WHERE reference = ?")
        .get(reference);

      if (existing) {
        return res.status(200).json(existing);
      }
    }

    const orderReference = reference || `ORD-${crypto.randomUUID()}`;

    try {
      const result = db
        .prepare(
          "INSERT INTO orders (reference, phone, amount, status) VALUES (?, ?, ?, 'PENDING')"
        )
        .run(orderReference, validation.normalizedPhone, validation.amount);

      const order = db
        .prepare("SELECT * FROM orders WHERE id = ?")
        .get(result.lastInsertRowid);

      res.status(201).json(order);
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        const existing = db
          .prepare("SELECT * FROM orders WHERE reference = ?")
          .get(orderReference);
        return res.status(200).json(existing);
      }
      throw error;
    }
  });

  // ---- Read --------------------------------------------------------------

  router.get("/", (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const total = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
    const orders = db
      .prepare("SELECT * FROM orders ORDER BY id DESC LIMIT ? OFFSET ?")
      .all(limit, offset);

    res.json({ page, limit, total, orders });
  });

  router.get("/:reference", (req, res) => {
    const order = db
      .prepare("SELECT * FROM orders WHERE reference = ?")
      .get(req.params.reference);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const payments = db
      .prepare("SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC")
      .all(order.id);

    res.json({ ...order, payments });
  });

  // ---- Update ------------------------------------------------------------

  router.patch("/:reference", requireApiKey, (req, res) => {
    const order = db
      .prepare("SELECT * FROM orders WHERE reference = ?")
      .get(req.params.reference);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "PENDING") {
      return res
        .status(409)
        .json({ error: `Cannot modify a ${order.status} order` });
    }

    const { phone, amount } = req.body || {};
    const validation = validateOrderPayload({
      phone: phone ?? order.phone,
      amount: amount ?? order.amount,
    });

    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    db.prepare(
      "UPDATE orders SET phone = ?, amount = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(validation.normalizedPhone, validation.amount, order.id);

    const updated = db
      .prepare("SELECT * FROM orders WHERE id = ?")
      .get(order.id);

    res.json(updated);
  });

  // ---- Delete ------------------------------------------------------------

  router.delete("/:reference", requireApiKey, (req, res) => {
    const order = db
      .prepare("SELECT * FROM orders WHERE reference = ?")
      .get(req.params.reference);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "PENDING") {
      return res
        .status(409)
        .json({ error: `Cannot delete a ${order.status} order` });
    }

    db.prepare("DELETE FROM orders WHERE id = ?").run(order.id);

    res.json({ deleted: true, reference: order.reference });
  });

  return router;
}

module.exports = { ordersRouter, MIN_AMOUNT, MAX_AMOUNT };
