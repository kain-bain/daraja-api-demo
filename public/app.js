const form = document.getElementById("paymentForm");
const phoneInput = document.getElementById("phone");
const amountInput = document.getElementById("amount");
const payButton = document.getElementById("payButton");
const statusBox = document.getElementById("status");

let checkoutRequestId = null;
let statusInterval = null;

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const phone = phoneInput.value.trim();
  const amount = Number(amountInput.value);

  if (!phone || !amount || amount < 1) {
    showStatus("Please enter a valid phone number and amount.", "failed");
    return;
  }

  payButton.disabled = true;
  payButton.textContent = "Sending STK Push...";

  showStatus(
    "Sending payment request to your phone...",
    "waiting"
  );

  try {
    const response = await fetch("/stkpush", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone,
        amount
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.details || data.error || "STK Push failed");
    }

    checkoutRequestId = data.CheckoutRequestID;

    showStatus(
      "STK Push sent. Check your phone and enter your M-Pesa PIN.",
      "waiting"
    );

    payButton.textContent = "Waiting for payment...";

    startPaymentStatusCheck();

  } catch (error) {
    console.error(error);

    showStatus(
      error.message || "Something went wrong.",
      "failed"
    );

    payButton.disabled = false;
    payButton.textContent = "Pay with M-Pesa";
  }
});

function startPaymentStatusCheck() {
  if (statusInterval) {
    clearInterval(statusInterval);
  }

  statusInterval = setInterval(async () => {

    if (!checkoutRequestId) return;

    try {

      const response = await fetch(
        `/payment-status/${checkoutRequestId}`
      );

      const data = await response.json();

      console.log("Payment status:", data);

      if (data.status === "SUCCESS") {

        clearInterval(statusInterval);

        showStatus(
          `Payment successful! M-Pesa Receipt: ${data.receipt || "Confirmed"}`,
          "success"
        );

        payButton.textContent = "Payment Successful";

      } else if (data.status === "FAILED") {

        clearInterval(statusInterval);

        showStatus(
          data.resultDesc || "Payment was not completed.",
          "failed"
        );

        payButton.disabled = false;
        payButton.textContent = "Try Again";
      }

    } catch (error) {
      console.error("Status check failed:", error);
    }

  }, 3000);
}

function showStatus(message, type) {

  statusBox.textContent = message;

  statusBox.className = `status ${type}`;
}
