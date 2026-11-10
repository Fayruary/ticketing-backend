const midtransClient = require("midtrans-client");

const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
const serverKey = process.env.MIDTRANS_SERVER_KEY || "SB-Mid-server-8bV9z0k4pQmNxY7j2W1dL-DEMO";
const clientKey = process.env.MIDTRANS_CLIENT_KEY || "SB-Mid-client-L5k1x8Y4nQz0mP2v-DEMO";

const snap = new midtransClient.Snap({
  isProduction,
  serverKey,
  clientKey
});

const coreApi = new midtransClient.CoreApi({
  isProduction,
  serverKey,
  clientKey
});

module.exports = {
  snap,
  coreApi,
  serverKey,
  clientKey,
  isProduction
};

