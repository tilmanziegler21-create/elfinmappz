function minutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function courierSlots(courier) {
  const start = minutes(courier?.time_from);
  const end = minutes(courier?.time_to);
  if (start === null || end === null || end <= start) return [];
  const list = [];
  for (let hour = Math.ceil(start / 60); hour * 60 < end; hour += 1) {
    const at = hour * 60;
    if (at >= start) list.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return list;
}
