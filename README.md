# Daraja API M-Pesa Payment Demo

A simple full-stack M-Pesa payment application built with **Node.js, Express, and Safaricom Daraja API**.

The project demonstrates how to:

* Authenticate with the Safaricom Daraja API
* Initiate an M-Pesa STK Push
* Receive the M-Pesa payment callback
* Track payment status
* Display `Waiting`, `Successful`, or `Failed` states on the frontend
* Deploy the application to Render

> **Environment:** Safaricom Daraja Sandbox
> **Purpose:** Learning, testing, and demonstration

---

## 🚀 Live Demo

**https://daraja-api-demo.onrender.com**

---

## 🛠️ Tech Stack

* Node.js
* Express.js
* Axios
* node:sqlite (built-in SQLite database)
* express-rate-limit
* HTML
* CSS
* JavaScript
* Safaricom Daraja API
* Render
* Git & GitHub

---

## 📁 Project Structure

```text
DarajaApi/
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── routes/
│   ├── orders.js        # Orders CRUD
│   └── payments.js      # STK push, callback, status polling
├── tests/
│   └── api.test.js      # node:test suite
├── db.js                # SQLite schema + helpers
├── daraja.js            # Daraja API helpers (OAuth, STK push)
├── middleware.js        # API key auth + rate limiting
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── server.js
```

The data layer is a SQLite database (`data/payments.db` by default) using
Node's built-in `node:sqlite` module, so payment records survive restarts.
Two tables are used: `orders` (customer intent) and `payments` (each STK push
attempt plus its callback result).

---

## 🔄 Payment Flow

```text
User
 │
 ▼
Frontend
 │
 │ POST /stkpush
 ▼
Node.js / Express
 │
 ▼
Safaricom Daraja API
 │
 ▼
M-Pesa STK Push
 │
 ▼
Customer enters M-Pesa PIN
 │
 ▼
Safaricom processes payment
 │
 ▼
POST /mpesa/callback
 │
 ▼
Backend updates payment status
 │
 ▼
Frontend polls /payment-status/:checkoutRequestId
 │
 ▼
Successful / Failed
```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

```env
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=your_shortcode
MPESA_PASSKEY=your_passkey
MPESA_ENVIRONMENT=sandbox
MPESA_CALLBACK_URL=https://your-public-url/mpesa/callback
API_KEY=choose_a_long_random_api_key_here
DATABASE_PATH=./data/payments.db
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `MPESA_*` | Yes | Your Safaricom Daraja credentials and configuration. |
| `MPESA_CALLBACK_URL` | No | Public URL Safaricom posts the callback to. Defaults to the Render URL. |
| `API_KEY` | No | When set, mutating endpoints require an `x-api-key` header. Leave unset for local development. |
| `DATABASE_PATH` | No | Location of the SQLite file. Defaults to `./data/payments.db`. Use `:memory:` for tests. |

### Security

**Never commit `.env` to GitHub.**

The `.gitignore` file should contain:

```gitignore
node_modules/
.env
.env.*
!.env.example
```

For Render, configure the environment variables through the Render dashboard instead of storing them in the source code.

---

## 💻 Running Locally

### 1. Clone the repository

```bash
git clone https://github.com/kain-bain/daraja-api-demo.git
cd daraja-api-demo
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create `.env` and add your Daraja credentials.

### 4. Start the server

```bash
npm start
```

The application will run on:

```text
http://localhost:3000
```

---

## 🧪 Local Callback Testing

When running locally, Safaricom cannot directly access:

```text
http://localhost:3000
```

A public HTTPS tunnel such as **ngrok** can be used during development.

Example:

```bash
ngrok http 3000
```

The callback URL can then be configured as:

```text
https://your-ngrok-domain.ngrok-free.dev/mpesa/callback
```

Set `MPESA_CALLBACK_URL` in your local `.env` to that full URL before starting
the server. This ensures the callback updates the same server that the browser
polls for payment status. Update it whenever your ngrok URL changes.

For the deployed application, the callback uses the Render URL:

```text
https://daraja-api-demo.onrender.com/mpesa/callback
```

The server uses this Render URL by default. Set `MPESA_CALLBACK_URL` in the
Render environment variables only if deploying under a different public URL.

---

## 📡 API Endpoints

### `GET /`

Serves the payment frontend.

### `POST /stkpush`

Initiates an M-Pesa STK Push (legacy convenience endpoint). It creates an
implicit order behind the scenes and returns the Daraja payload plus a
`reference` you can use to poll status.

Example request:

```json
{
  "phone": "0712345678",
  "amount": 10
}
```

The backend converts the Kenyan phone number to the `254XXXXXXXXX` format required by the API.

### `POST /mpesa/callback`

Receives the payment result from Safaricom and updates the matching order and
payment records in the database.

### `GET /payment-status/:checkoutRequestId`

Returns the current payment status for a given Checkout Request ID.

### Orders API

Orders are the primary resource. A payment attempt is always tied to an order.

| Method | Endpoint | Notes |
| --- | --- | --- |
| `POST` | `/api/orders` | Create an order. `{ phone, amount, reference? }`. Idempotent on `reference`. Requires `x-api-key` if `API_KEY` is set. |
| `GET` | `/api/orders?page=1&limit=20` | List orders (paginated). |
| `GET` | `/api/orders/:reference` | Get one order with its payment attempts. |
| `PATCH` | `/api/orders/:reference` | Update a `PENDING` order's phone/amount. |
| `DELETE` | `/api/orders/:reference` | Delete a `PENDING` order. |
| `POST` | `/api/orders/:reference/stkpush` | Initiate an STK push for the order. |
| `GET` | `/api/orders/:reference/status` | Poll status: `WAITING` / `SUCCESS` / `FAILED`, with `receipt` and `resultDesc`. |

Order statuses: `PENDING` → `PAID` / `FAILED`.
Payment statuses: `WAITING` → `SUCCESS` / `FAILED`.

---

## 🧪 Running the Tests

```bash
npm test
```

The suite uses Node's built-in test runner (`node --test`) and an in-memory
SQLite database with an injected fake `stkPush`, so it runs offline with no
Daraja credentials or network access.

---

## ☁️ Deployment

The application can be deployed as a Node.js Web Service on Render.

### Build Command

```bash
npm install
```

### Start Command

```bash
npm start
```

The application uses the Render-provided `PORT` environment variable:

```javascript
const PORT = process.env.PORT || 3000;
```

The server listens on:

```text
0.0.0.0
```

to allow Render to route traffic to the application.

---

## 🔐 Important Security Notes

This project is intended for demonstration and learning.

For a production payment application, additional security and reliability measures should be implemented, including:

* Transaction reconciliation with Safaricom's Transaction Status API
* Webhook signature verification (Daraja callbacks are not signed by default)
* Secure secret management
* Monitoring and alerting

### What this demo already implements

* Persistent payment storage using SQLite
* Authentication on mutating endpoints (via `API_KEY`)
* Request validation (phone/amount)
* Idempotency handling (order references)
* Rate limiting (`express-rate-limit`)

The previous version stored payment status in an in-memory JavaScript `Map`,
which lost all records on restart. This has been replaced by a persistent
SQLite database.

---

## 📌 Current Status

* [x] Daraja OAuth authentication (with token caching)
* [x] STK Push
* [x] M-Pesa callback persisted to the database
* [x] Order-based payment tracking (SQLite)
* [x] Orders CRUD API with validation and idempotency
* [x] Frontend payment interface
* [x] Orders list view with status badges
* [x] Waiting / Successful / Failed states
* [x] API key auth + rate limiting
* [x] Automated test suite (`npm test`)
* [x] GitHub repository
* [x] Render deployment
* [x] Public callback URL

---

## 👨‍💻 Author

**KB**

Software Engineering Student & Developer

---

## 📄 License

This project is intended primarily for educational and demonstration purposes.
