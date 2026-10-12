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

function stopStatusCheck() {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
}

function showStatus(message, type) {

  statusBox.textContent = message;

  statusBox.className = `status ${type}`;
}

// ---- Orders view --------------------------------------------------------

const payView = document.getElementById("payView");
const ordersView = document.getElementById("ordersView");
const showOrdersBtn = document.getElementById("showOrders");
const showPayBtn = document.getElementById("showPay");
const refreshOrdersBtn = document.getElementById("refreshOrders");
const ordersList = document.getElementById("ordersList");
const ordersEmpty = document.getElementById("ordersEmpty");

function showPayView() {
  payView.classList.remove("hidden");
  ordersView.classList.add("hidden");
  stopStatusCheck();
}

function showOrdersView() {
  ordersView.classList.remove("hidden");
  payView.classList.add("hidden");
  stopStatusCheck();
  loadOrders();
}

showOrdersBtn.addEventListener("click", showOrdersView);
showPayBtn.addEventListener("click", showPayView);
refreshOrdersBtn.addEventListener("click", loadOrders);

function badgeClass(status) {
  return `badge badge-${String(status).toLowerCase()}`;
}

async function loadOrders() {
  try {
    const response = await fetch("/api/orders?limit=50");
    const data = await response.json();

    ordersList.innerHTML = "";

    if (!data.orders || data.orders.length === 0) {
      ordersEmpty.classList.remove("hidden");
      return;
    }

    ordersEmpty.classList.add("hidden");

    for (const order of data.orders) {
      const li = document.createElement("li");
      li.className = "order-row";

      const info = document.createElement("div");
      info.className = "order-info";

      const ref = document.createElement("span");
      ref.className = "order-ref";
      ref.textContent = order.reference;

      const meta = document.createElement("span");
      meta.className = "order-meta";
      meta.textContent = `${order.phone} · KES ${order.amount}`;

      info.appendChild(ref);
      info.appendChild(meta);

      const right = document.createElement("div");
      right.className = "order-right";

      const badge = document.createElement("span");
      badge.className = badgeClass(order.status);
      badge.textContent = order.status;

      right.appendChild(badge);
      li.appendChild(info);
      li.appendChild(right);
      ordersList.appendChild(li);
    }
  } catch (error) {
    console.error("Failed to load orders:", error);
    ordersEmpty.textContent = "Failed to load orders.";
    ordersEmpty.classList.remove("hidden");
  }
}
