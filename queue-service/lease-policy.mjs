// Server policy, shared by Cloudflare and the Node fallback. The preparing
// deadline starts at direct grant or confirmed pickup, never at queue entry.
export const PREPARE_LEASE_MS=20000;
export const SEND_WINDOW_MS=5000;
export const RETRY_WAIT_MS=10000;
export const RETRY_PICKUP_MS=10000;
export const MAX_RETRY_ATTEMPTS=3;
export const MAX_RETRY_AFTER_MS=120000;
export const UNKNOWN_RESULT_GRACE_MS=20000;
export const MAX_UNKNOWN_RESULT_GRACE_MS=30000;
export const UNCLAIMED_PICKUP_MS=45000;
export const RATE_LIMIT_BACKOFF_MS=[15000,30000,60000];
export const MAX_RATE_LIMIT_COOLDOWN_MS=120000;
export const RATE_LIMIT_HISTORY_MS=300000;
