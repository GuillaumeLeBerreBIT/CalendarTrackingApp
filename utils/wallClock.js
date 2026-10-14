// Convert an absolute instant to the wall-clock date/time seen in an IANA timezone.
export function toWallClock(instant, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(instant).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour; // some ICU builds emit "24"
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}:${p.second}` };
}
