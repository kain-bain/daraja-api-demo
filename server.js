require("dotenv").config();

const express = require("express");
const { initDb } = require("./db");
const { ordersRouter } = require("./routes/orders");
const { paymentsRouter } = require("./routes/payments");
const { stkPush, formatKenyanPhone } = require("./daraja");

const app = express();

app.use(express.json());
app.use(express.static("public"));

// Initialise the SQLite database (file persists across restarts).
const db = initDb();
app.locals.db = db;

// Serve the payment frontend.
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// Mount the API routers.
app.use("/", paymentsRouter(db));
app.use("/api/orders", ordersRouter(db));

// ---- Legacy endpoints (backwards compatibility) -------------------------
// Kept so the original /stkpush + /payment-status/:id clients still work.
// These create an implicit order behind the scenes.

app.post("/stkpush", async (req, res) => {
  const { phone, amount } = req.body || {};

  const normalized = formatKenyanPhone(phone);
  if (!normalized) {
    return res.status(400).json({ error: "Invalid Kenyan phone number" });
  }
  if (!Number.isInteger(Number(amount)) || Number(amount) < 1) {
    return res.status(400).json({ error: "Phone number and amount are required" });
  }

  try {
    // Create an implicit order, then push against it.
    const reference = `LEGACY-${Date.now()}`;
    const orderResult = db
      .prepare(
        "INSERT INTO orders (reference, phone, amount, status) VALUES (?, ?, ?, 'PENDING')"
      )
      .run(reference, normalized, Number(amount));

    const data = await stkPush({
      phone: normalized,
      amount: Number(amount),
      reference: "DarajaTest",
    });

    db.prepare(
      `INSERT INTO payments (order_id, checkout_request_id, merchant_request_id, status)
       VALUES (?, ?, ?, 'WAITING')`
    ).run(orderResult.lastInsertRowid, data.CheckoutRequestID, data.MerchantRequestID);

    // Return the Daraja payload plus our order reference for status polling.
    res.json({ ...data, reference });
  } catch (error) {
    console.error("STK Error:", error.response?.data || error.message);
    res.status(500).json({
      error: "STK Push failed",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/payment-status/:checkoutRequestId", (req, res) => {
  const payment = db
    .prepare("SELECT * FROM payments WHERE checkout_request_id = ?")
    .get(req.params.checkoutRequestId);

  if (!payment) {
    return res.status(404).json({ status: "NOT_FOUND" });
  }

  res.json({
    status: payment.status,
    resultDesc: payment.result_desc,
    receipt: payment.receipt,
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
