// Never display arbitrary response bodies or exception messages from token requests.
const messages = new Map([
  ["unauthorized", "RunComfy rejected this token. Check that it is valid for the configured API environment and can access this model."],
  ["invalid_config", "The token format is invalid. Paste only the API token, without a Bearer prefix or spaces."],
  ["forbidden", "ComfyUI blocked the configuration request. Reload this page using the server's configured URL and try again."],
  ["config_error", "ComfyUI could not update its token configuration. Check the server configuration and file permissions."],
  ["private_storage_unavailable", "RunComfy private account storage is unavailable. Restart the machine or contact support to restore its private account storage."],
  ["network_error", "Your ComfyUI server could not reach RunComfy to verify the token. Try again shortly."],
  ["api_error", "RunComfy is currently unavailable or returned an error while verifying the token. Try again shortly."],
  ["invalid_response", "RunComfy returned an unreadable response while verifying the token. Try again shortly."],
  ["price_unavailable", "Model pricing is currently unavailable, so the token could not be verified. Try again shortly."],
  ["insufficient_balance", "RunComfy reported insufficient balance. Check your RunComfy account."],
  ["server_error", "The ComfyUI server could not update the token configuration. Check the server log and try again."],
]);

export function describeTokenConfigError(error) {
  return messages.get(error?.code) ?? "Check your ComfyUI server connection and try again.";
}

export async function tokenConfigError(response) {
  let payload;
  try { payload = await response.json(); } catch { /* Origin checks may return plain text. */ }
  const fallback = { 400: "invalid_config", 401: "unauthorized", 403: "forbidden" };
  const code = messages.has(payload?.code) ? payload.code : fallback[response.status] ?? "server_error";
  const error = new Error(messages.get(code));
  error.code = code;
  return error;
}
