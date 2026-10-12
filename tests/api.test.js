const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { initDb } = require("../db");
const { ordersRouter } = require("../routes/orders");
const { paymentsRouter } = require("../routes/payments");

/**
 * Build a fresh app backed by an in-memory DB, with an injectable fake
 * stkPush so tests never touch the real Daraja API.
 */
function buildApp() {
  const db = initDb(":memory:");

  const calls = [];
  const fakeStkPush = async (opts) => {
    calls.push(opts);
    return {
      CheckoutRequestID: `CRID-${calls.length}`,
      MerchantRequestID: `MRID-${calls.length}`,
    };
  };

  const app = express();
  app.use(express.json());
  app.use("/", paymentsRouter(db, { stkPush: fakeStkPush }));
  app.use("/api/orders", ordersRouter(db));

  return { app, db, calls };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

async function api(base, path, options = {}) {
  const res = await fetch(base + path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

// ---- Orders ---------------------------------------------------------------

test("creates an order and normalises the phone number", async () => {
  const { app } = buildApp();
  await withServer(app, async (base) => {
    const res = await api(base, "/api/orders", {
      method: "POST",
      body: { phone: "0712 345 678", amount: 100 },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.phone, "254712345678");
    assert.equal(res.body.amount, 100);
    assert.equal(res.body.status, "PENDING");
    assert.match(res.body.reference, /^ORD-/);
  });
});

test("rejects an invalid phone number", async () => {
  const { app } = buildApp();
  await withServer(app, async (base) => {
    const res = await api(base, "/api/orders", {
      method: "POST",
      body: { phone: "12345", amount: 100 },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /phone/i);
  });
});

test("rejects an out-of-range amount", async () => {
  const { app } = buildApp();
  await withServer(app, async (base) => {
    const res = await api(base, "/api/orders", {
      method: "POST",
      body: { phone: "0712345678", amount: 999999 },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /amount/i);
  });
});

test("create is idempotent for the same reference", async () => {
  const { app } = buildApp();
  await withServer(app, async (base) => {
    const first = await api(base, "/api/orders", {
      method: "POST",
      body: { reference: "REF-1", phone: "0712345678", amount: 100 },
    });
    assert.equal(first.status, 201);

    const second = await api(base, "/api/orders", {
      method: "POST",
      body: { reference: "REF-1", phone: "0712345678", amount: 100 },
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.id, first.body.id);
  });
});

test("lists orders and returns 404 for unknown reference", async () => {
  const { app } = buildApp();
  await withServer(app, async (base) => {
    await api(base, "/api/orders", {
      method: "POST",
      body: { phone: "0712345678", amount: 100 },
    });

    const list = await api(base, "/api/orders");
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 1);
    assert.equal(list.body.orders.length, 1);

    const missing = await api(base, "/api/orders/NOPE");
    assert.equal(missing.status, 404);
  });
});

test("updates a pending order but not a paid one", async () => {
  const { app, db } = buildApp();
  await withServer(app, async (base) => {
    const created = await api(base, "/api/orders", {
      method: "POST",
      body: { phone: "0712345678", amount: 100 },
    });

    const updated = await api(base, `/api/orders/${created.body.reference}`, {
      method: "PATCH",
      body: { amount: 250 },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.amount, 250);

    db.prepare("UPDATE orders SET status = 'PAID' WHERE id = ?").run(
      created.body.id
    );

    const blocked = await api(base, `/api/orders/${created.body.reference}`, {
      method: "PATCH",
      body: { amount: 999 },
    });
    assert.equal(blocked.status, 409);
  });
});

test("deletes a pending order", async () => {
  const { app } = buildApp();
  await withServer(app, async (base) => {
    const created = await api(base, "/api/orders", {
      method: "POST",
      body: { phone: "0712345678", amount: 100 },
    });

    const deleted = await api(base, `/api/orders/${created.body.reference}`, {
      method: "DELETE",
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.deleted, true);

    const again = await api(base, `/api/orders/${created.body.reference}`, {
      method: "DELETE",
    });
    assert.equal(again.status, 404);
  });
});

// ---- Payments -------------------------------------------------------------

test("STK push persists a WAITING payment linked to the order", async () => {
  const { app, db } = buildApp();
  await withServer(app, async (base) => {
    const created = await api(base, "/api/orders", {
      method: "POST",
      body: { phone: "0712345678", amount: 100 },
    });

    const res = await api(
      base,
      `/api/orders/${created.body.reference}/stkpush`,
      { method: "POST" }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.CheckoutRequestID, "CRID-1");

    const payment = db
      .prepare("SELECT * FROM payments WHERE order_id = ?")
      .get(created.body.id);
    assert.equal(payment.status, "WAITING");
    assert.equal(payment.checkout_request_id, "CRID-1");
  });
});

test("success callback marks order PAID and stores the receipt", async () => {
  const { app, db } = buildApp();
  await withServer(app, async (base) => {
    const created = await api(base, "/api/orders", {
      method: "POST",
      body: { phone: "0712345678", amount: 100 },
    });
    await api(base, `/api/orders/${created.body.reference}/stkpush`, {
      method: "POST",
    });

    const callback = {
      Body: {
        stkCallback: {
          MerchantRequestID: "MRID-1",
          CheckoutRequestID: "CRID-1",
          ResultCode: 0,
          ResultDesc: "success",
          CallbackMetadata: {
            Item: [{ Name: "MpesaReceiptNumber", Value: "QGR123" }],
          },
        },
      },
    };

    const res = await api(base, "/mpesa/callback", {
      method: "POST",
      body: callback,
    });
    assert.equal(res.body.ResultCode, 0);

    const order = db
      .prepare("SELECT * FROM orders WHERE id = ?")
      .get(created.body.id);
    assert.equal(order.status, "PAID");

    const payment = db
      .prepare("SELECT * FROM payments WHERE order_id = ?")
      .get(created.body.id);
    assert.equal(payment.status, "SUCCESS");
    assert.equal(payment.receipt, "QGR123");

    const status = await api(
      base,
      `/api/orders/${created.body.reference}/status`
    );
    assert.equal(status.body.status, "SUCCESS");
    assert.equal(status.body.receipt, "QGR123");
    assert.equal(status.body.orderStatus, "PAID");
  });
});

test("failed callback marks order FAILED", async () => {
  const { app, db } = buildApp();
  await withServer(app, async (base) => {
    const created = await api(base, "/api/orders", {
      method: "POST",
      body: { phone: "0712345678", amount: 100 },
    });
    await api(base, `/api/orders/${created.body.reference}/stkpush`, {
      method: "POST",
    });

    const callback = {
      Body: {
        stkCallback: {
          MerchantRequestID: "MRID-1",
          CheckoutRequestID: "CRID-1",
          ResultCode: 1032,
          ResultDesc: "Request cancelled by user",
        },
      },
    };

    await api(base, "/mpesa/callback", { method: "POST", body: callback });

    const order = db
      .prepare("SELECT * FROM orders WHERE id = ?")
      .get(created.body.id);
    assert.equal(order.status, "FAILED");
  });
});

test("callback for an unknown CheckoutRequestID is accepted safely", async () => {
  const { app } = buildApp();
  await withServer(app, async (base) => {
    const callback = {
      Body: {
        stkCallback: {
          CheckoutRequestID: "UNKNOWN",
          ResultCode: 0,
          ResultDesc: "ok",
        },
      },
    };
    const res = await api(base, "/mpesa/callback", {
      method: "POST",
      body: callback,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ResultCode, 0);
  });
});

