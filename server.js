require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());
app.use(express.static("public"));

const payments = new Map();

const PORT = process.env.PORT || 3000;

const BASE_URL =
  process.env.MPESA_ENVIRONMENT === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : "https://api.safaricom.co.ke";

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/oauth", async (req, res) => {
  try {
    const credentials = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString("base64");

    const response = await axios.get(
      `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    );

    console.log("Access Token:", response.data.access_token);

    res.json(response.data);
  } catch (error) {
    console.error(
      "OAuth Error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "Failed to obtain access token",
      details: error.response?.data || error.message,
    });
  }
});

app.post("/stkpush", async (req, res) => {
  try {
    const { phone, amount } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({
        error: "Phone number and amount are required"
      });
    }

    // Convert Kenyan phone number to 254 format
    let formattedPhone = phone.replace(/\s+/g, "");

    if (formattedPhone.startsWith("0")) {
      formattedPhone = "254" + formattedPhone.substring(1);
    }

    if (!formattedPhone.startsWith("254")) {
      return res.status(400).json({
        error: "Invalid Kenyan phone number"
      });
    }

    // 1. Get OAuth access token
    const credentials = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString("base64");

    const tokenResponse = await axios.get(
      `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // 2. Create timestamp
    const date = new Date();

    const timestamp =
      date.getFullYear().toString() +
      String(date.getMonth() + 1).padStart(2, "0") +
      String(date.getDate()).padStart(2, "0") +
      String(date.getHours()).padStart(2, "0") +
      String(date.getMinutes()).padStart(2, "0") +
      String(date.getSeconds()).padStart(2, "0");

    // 3. Create password
    const password = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString("base64");

    // 4. STK Push
    const stkResponse = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Number(amount),
        PartyA: formattedPhone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,

        CallBackURL:
          "https://fructose-stiffen-hatchback.ngrok-free.dev/mpesa/callback",

        AccountReference: "DarajaTest",
        TransactionDesc: "Daraja sandbox test",
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("STK Response:", stkResponse.data);

    const checkoutRequestId =
      stkResponse.data.CheckoutRequestID;

    // Track payment
    payments.set(checkoutRequestId, {
      status: "WAITING",
      phone: formattedPhone,
      amount: Number(amount),
      createdAt: new Date()
    });

    res.json(stkResponse.data);

  } catch (error) {

    console.error(
      "STK Error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "STK Push failed",
      details:
        error.response?.data || error.message
    });
  }
});

app.post("/mpesa/callback", (req, res) => {
  const callback = req.body?.Body?.stkCallback;

  console.log("\n===== M-PESA CALLBACK =====");
  console.log(JSON.stringify(req.body, null, 2));

  if (!callback) {
    console.log("Invalid M-Pesa callback");
    return res.json({
      ResultCode: 1,
      ResultDesc: "Invalid callback",
    });
  }

  const {
    MerchantRequestID,
    CheckoutRequestID,
    ResultCode,
    ResultDesc,
    CallbackMetadata,
  } = callback;

  console.log("\n===== PAYMENT RESULT =====");
  console.log("Merchant Request ID:", MerchantRequestID);
  console.log("Checkout Request ID:", CheckoutRequestID);
  console.log("Result Code:", ResultCode);
  console.log("Result Description:", ResultDesc);

  const payment = payments.get(CheckoutRequestID);

if (payment) {
  if (ResultCode === 0) {

    const items = CallbackMetadata?.Item || [];

    const receipt = items.find(
      (item) => item.Name === "MpesaReceiptNumber"
    )?.Value;

    payment.status = "SUCCESS";
    payment.resultDesc = ResultDesc;
    payment.receipt = receipt;

  } else {

    payment.status = "FAILED";
    payment.resultDesc = ResultDesc;
  }
}

  if (ResultCode === 0) {
    console.log("✅ PAYMENT SUCCESSFUL");

    const items = CallbackMetadata?.Item || [];

    const amount = items.find(
      (item) => item.Name === "Amount"
    )?.Value;

    const receipt = items.find(
      (item) => item.Name === "MpesaReceiptNumber"
    )?.Value;

    const phone = items.find(
      (item) => item.Name === "PhoneNumber"
    )?.Value;

    console.log("Amount:", amount);
    console.log("Receipt:", receipt);
    console.log("Phone:", phone);
  } else {
    console.log("❌ PAYMENT NOT COMPLETED");
    console.log("Reason:", ResultDesc);
  }

  console.log("===========================\n");

  res.json({
    ResultCode: 0,
    ResultDesc: "Accepted",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

app.get("/payment-status/:checkoutRequestId", (req, res) => {

  const payment = payments.get(
    req.params.checkoutRequestId
  );

  if (!payment) {
    return res.status(404).json({
      status: "NOT_FOUND"
    });
  }

  res.json(payment);
});