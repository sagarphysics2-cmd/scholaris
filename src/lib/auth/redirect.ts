/** Only allow same-site relative redirects (prevents open-redirect abuse via ?next=). */
export function safeNext(next: FormDataEntryValue | null) {
  // A single leading slash, then no slash/backslash, and no whitespace or control chars
  // anywhere (browsers strip tabs/newlines, turning "/\t/evil.com" into "//evil.com").
  return typeof next === "string" && next.length < 500 && /^\/(?![\/\\])[^\s\\\u0000-\u001f]*$/.test(next) ? next : "/dashboard";
}
