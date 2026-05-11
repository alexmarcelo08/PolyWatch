export function nowIso() {
  return new Date().toISOString();
}

export function unixToIso(timestamp: number) {
  return new Date(timestamp * 1000).toISOString();
}

export function formatLocal(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(",", "");
}
