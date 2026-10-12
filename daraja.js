const axios = require("axios");

const BASE_URL =
  process.env.MPESA_ENVIRONMENT === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : "https://api.safaricom.co.ke";

const CALLBACK_URL =
  process.env.MPESA_CALLBACK_URL ||
  "https://daraja-api-demo.onrender.com/mpesa/callback";

// Cached OAuth token (Daraja tokens are valid for ~1 hour).
let cachedToken = null;
let cachedTokenExpiry = 0;

/**
 * Normalise a Kenyan phone number to the 254XXXXXXXXX format Daraja expects.
 * Returns null when the number cannot be recognised.
 */
function formatKenyanPhone(input) {
  if (!input) return null;

  let phone = String(input).replace(/[\s\-()+]/g, "");

  if (phone.startsWith("0")) {
    phone = "254" + phone.slice(1);
  } else if (phone.startsWith("254")) {
    // already in international format
  } else if (/^[17]\d{8}$/.test(phone)) {
    // bare subscriber number like 712345678
    phone = "254" + phone;
  } else {
    return null;
  }

  // Valid Safaricom/Airtel subscriber numbers are 254 + 9 digits.
  if (!/^254[17]\d{8}$/.test(phone)) return null;

  return phone;
}

/** YYYYMMDDHHmmss in East Africa Time (UTC+3), as Daraja expects. */
function getTimestamp(date = new Date()) {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");

  return (
    eat.getUTCFullYear().toString() +
    pad(eat.getUTCMonth() + 1) +
    pad(eat.getUTCDate()) +
    pad(eat.getUTCHours()) +
    pad(eat.getUTCMinutes()) +
    pad(eat.getUTCSeconds())
  );
}

/** Build the base64 password Daraja requires for STK push. */
function getPassword(shortcode, passkey, timestamp) {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

/**
 * Fetch an OAuth access token, reusing a cached one until it is close to
 * expiry. Throws on failure.
 */
async function getAccessToken() {
  const now = Date.now();

  if (cachedToken && now < cachedTokenExpiry - 60_000) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const response = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  cachedToken = response.data.access_token;
  // Daraja returns expires_in (seconds); default to 1 hour if absent.
  const ttl = Number(response.data.expires_in || 3600) * 1000;
  cachedTokenExpiry = now + ttl;

  return cachedToken;
}

/**
 * Initiate an STK push for a normalised phone number and amount.
 * Returns the raw Daraja response body.
 */
async function stkPush({ phone, amount, reference, description }) {
  const accessToken = await getAccessToken();
  const timestamp = getTimestamp();
  const password = getPassword(
    process.env.MPESA_SHORTCODE,
    process.env.MPESA_PASSKEY,
    timestamp
  );

  const response = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Number(amount),
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: CALLBACK_URL,
      AccountReference: reference || "DarajaTest",
      TransactionDesc: description || "Daraja sandbox test",
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

module.exports = {
  BASE_URL,
  CALLBACK_URL,
  formatKenyanPhone,
  getTimestamp,
  getPassword,
  getAccessToken,
  stkPush,
};
