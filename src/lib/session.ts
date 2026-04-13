export function getSessionId(): string {
  let id = localStorage.getItem("foto-delivery-session");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("foto-delivery-session", id);
  }
  return id;
}
