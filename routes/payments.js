const express = require("express");
const { requireApiKey, writeLimiter } = require("../middleware");
const daraja = require("../daraja");

/**
 * Build the payments router bound to a database instance.
 * `deps.stkPush` can be injected for testing; defaults to the real Daraja call.
 */
function paymentsRouter(db, deps = {}) {
  const router = express.Router();
  const push = deps.stkPush || daraja.stkPush;

  // ---- Initiate STK push for an order ------------------------------------

  router.post(
    "/orders/:reference/stkpush",
    requireApiKey,
    writeLimiter,
    async (req, res) => {
      const order = db
        .prepare("SELECT * FROM orders WHERE reference = ?")
        .get(req.params.reference);

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.status === "PAID") {
        return res.status(409).json({ error: "Order already paid" });
      }

      try {
        const data = await push({
          phone: order.phone,
          amount: order.amount,
          reference: order.reference,
        });

        // Persist the payment attempt so the callback can find it later.
        db.prepare(
          `INSERT INTO payments (order_id, checkout_request_id, merchant_request_id, status)
           VALUES (?, ?, ?, 'WAITING')`
        ).run(
          order.id,
          data.CheckoutRequestID,
          data.MerchantRequestID
        );

        res.json(data);
      } catch (error) {
        console.error(
          "STK Error:",
          error.response?.data || error.message
        );

        res.status(500).json({
          error: "STK Push failed",
          details: error.response?.data || error.message,
        });
      }
    }
  );

  // ---- M-Pesa callback ----------------------------------------------------

  function itemValue(items, name) {
    return (items || []).find((i) => i.Name === name)?.Value;
  }

  router.post("/mpesa/callback", (req, res) => {
    const callback = req.body?.Body?.stkCallback;

    if (!callback) {
      return res.json({ ResultCode: 1, ResultDesc: "Invalid callback" });
    }

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = callback;

    const payment = db
      .prepare("SELECT * FROM payments WHERE checkout_request_id = ?")
      .get(CheckoutRequestID);

    if (payment) {
      const success = ResultCode === 0;
      const items = CallbackMetadata?.Item || [];
      const receipt = itemValue(items, "MpesaReceiptNumber");

      db.prepare(
        `UPDATE payments
         SET status = ?, result_code = ?, result_desc = ?, receipt = ?,
             raw_callback = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        success ? "SUCCESS" : "FAILED",
        ResultCode,
        ResultDesc,
        receipt || null,
        JSON.stringify(req.body),
        payment.id
      );

      // Reflect the terminal state back onto the order.
      if (success) {
        db.prepare(
          "UPDATE orders SET status = 'PAID', updated_at = datetime('now') WHERE id = ?"
        ).run(payment.order_id);
      } else {
        db.prepare(
          "UPDATE orders SET status = 'FAILED', updated_at = datetime('now') WHERE id = ?"
        ).run(payment.order_id);
      }
    } else {
      console.warn("Callback for unknown CheckoutRequestID:", CheckoutRequestID);
    }

    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  });

  // ---- Status polling -----------------------------------------------------

  router.get("/orders/:reference/status", (req, res) => {
    const order = db
      .prepare("SELECT * FROM orders WHERE reference = ?")
      .get(req.params.reference);

    if (!order) {
      return res.status(404).json({ status: "NOT_FOUND" });
    }

    const payment = db
      .prepare("SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1")
      .get(order.id);

    if (!payment) {
      return res.json({ status: order.status });
    }

    res.json({
      status: payment.status,
      orderStatus: order.status,
      receipt: payment.receipt,
      resultDesc: payment.result_desc,
    });
  });

  return router;
}

module.exports = { paymentsRouter };

