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
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── server.js
```

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
```

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

For the deployed application, the callback uses the Render URL:

```text
https://daraja-api-demo.onrender.com/mpesa/callback
```

---

## 📡 API Endpoints

### `GET /`

Serves the payment frontend.

### `POST /stkpush`

Initiates an M-Pesa STK Push.

Example request:

```json
{
  "phone": "0712345678",
  "amount": 10
}
```

The backend converts the Kenyan phone number to the `254XXXXXXXXX` format required by the API.

### `POST /mpesa/callback`

Receives the payment result from Safaricom.

The callback contains information such as:

* Merchant Request ID
* Checkout Request ID
* Result Code
* Result Description
* M-Pesa Receipt Number
* Phone Number
* Transaction Amount

### `GET /payment-status/:checkoutRequestId`

Returns the current payment status.

Possible states include:

```text
WAITING
SUCCESS
FAILED
```

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

* Persistent payment storage using a database
* Authentication and authorization
* Request validation
* Idempotency handling
* Proper transaction reconciliation
* Secure logging
* Rate limiting
* HTTPS
* Webhook verification/validation
* Proper error handling
* Production Daraja credentials
* Monitoring and alerting

The current payment status storage uses an in-memory JavaScript `Map`, meaning payment records are lost when the server restarts.

---

## 📌 Current Status

* [x] Daraja OAuth authentication
* [x] STK Push
* [x] M-Pesa callback
* [x] Payment status tracking
* [x] Frontend payment interface
* [x] Waiting state
* [x] Successful state
* [x] Failed state
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
