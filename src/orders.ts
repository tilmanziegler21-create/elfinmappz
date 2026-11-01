export function positionWord(count: number, lang = "ru") {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const one = mod10 === 1 && mod100 !== 11;
  const few = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14);
  if (lang === "uk") return one ? "позиція" : few ? "позиції" : "позицій";
  if (lang === "de") return count === 1 ? "Position" : "Positionen";
  if (lang === "en") return count === 1 ? "item" : "items";
  if (one) return "позиция";
  if (few) return "позиции";
  return "позиций";
}
