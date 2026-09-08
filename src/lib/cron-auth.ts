// Vercel Cron requests include `Authorization: Bearer ${CRON_SECRET}` when
// CRON_SECRET is set. If it's unset (e.g. local dev), requests are allowed
// through so manual invocation works without extra setup — per spec §9's
// build order, cron endpoints should work standalone before cron is wired up.
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
