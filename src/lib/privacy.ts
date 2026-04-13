export function maskEmail(email?: string | null) {
  if (!email || !email.includes("@")) return email ?? "";

  const [name, domain] = email.split("@");
  if (name.length <= 2) return `${name[0] ?? ""}***@${domain}`;

  return `${name.slice(0, 2)}${"*".repeat(Math.min(name.length - 2, 6))}@${domain}`;
}
