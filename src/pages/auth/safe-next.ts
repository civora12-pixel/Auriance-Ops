/** Only allow same-site paths as a post-login destination. */
export function safeNext(next: string | null): string {
  // "//host" and "/\\host" are protocol-relative URLs to another site
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.startsWith("/login") || next.startsWith("/setup")) return "/";
  return next;
}
