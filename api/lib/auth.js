const isAdmin = (event) => {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return true;
  const token = event.headers?.['x-admin-token'] || event.headers?.['X-Admin-Token'];
  return token && token === expected;
};

const getListenerIdentity = (event) => {
  const email = event.headers?.['x-listener-email'] || event.headers?.['X-Listener-Email'] || '';
  const paypalPayerId = event.headers?.['x-paypal-payer-id'] || event.headers?.['X-Paypal-Payer-Id'] || '';
  return {
    email: String(email).trim().toLowerCase(),
    paypalPayerId: String(paypalPayerId).trim(),
  };
};

module.exports = {
  isAdmin,
  getListenerIdentity,
};
