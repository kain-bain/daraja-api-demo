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

  return router;
}

module.exports = { paymentsRouter };

