require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;

const BASE_URL =
  process.env.MPESA_ENVIRONMENT === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : "https://api.safaricom.co.ke";

app.get("/", (req, res) => {
  res.send("Daraja test server is running 🚀");
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

app.get("/stkpush", async (req, res) => {
  try {
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

    // 4. STK Push request
    const stkResponse = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: 1,
        PartyA: "254798685285",
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: "254798685285",
        CallBackURL: "https://fructose-stiffen-hatchback.ngrok-free.dev/mpesa/callback",
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

    res.json(stkResponse.data);
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
});

app.use(express.json());

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