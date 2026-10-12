require("dotenv").config();

const express = require("express");
const { initDb } = require("./db");
const { ordersRouter } = require("./routes/orders");
const { paymentsRouter } = require("./routes/payments");

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
