export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function checkTldTypo(email: string): string | null {
  const domain = (email.split("@")[1] || "").toLowerCase();
  const parts = domain.split(".");
  const tld = parts[parts.length - 1] || "";
  const commonTypos: Record<string, string> = {
    con: "com",
    cim: "com",
    c0m: "com",
    orf: "org",
    ogr: "org",
    nete: "net",
  };
  if (tld in commonTypos) return commonTypos[tld];
  return null;
}
