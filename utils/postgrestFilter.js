// Values interpolated into a PostgREST .or() string must not contain the
// characters that separate or group conditions, or wildcards.
export function sanitizeOrTerm(raw) {
  return String(raw ?? "").trim().replace(/[,()%*]/g, "");
}
