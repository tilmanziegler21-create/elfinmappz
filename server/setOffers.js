export const setOffers = [
  { id: "1", liquids: 1, cartridges: 2, pod: false, price: 25 },
  { id: "2", liquids: 2, cartridges: 4, pod: false, price: 45 },
  { id: "3", liquids: 2, cartridges: 0, pod: true, price: 50 },
  { id: "4", liquids: 2, cartridges: 2, pod: true, price: 60 },
  { id: "5", liquids: 4, cartridges: 0, pod: true, price: 70 },
  { id: "6", liquids: 4, cartridges: 4, pod: true, price: 90 },
  { id: "7", liquids: 4, cartridges: 0, pod: true, pods: 2, price: 90 },
];

export function setDealPrice(offerId, items) {
  const offer = setOffers.find((item) => item.id === String(offerId || ""));
  if (!offer || !Array.isArray(items) || items.length === 0) return null;
  let pods = 0;
  let liquids = 0;
  let cartridges = 0;
  let other = 0;
  for (const item of items) {
    const category = String(item?.category || "").trim().toLowerCase();
    const qty = Number(item?.quantity) || 0;
    if (qty < 1) return null;
    if (category === "pod" || category === "pods") pods += qty;
    else if (category === "liquids") liquids += qty;
    else if (category === "cartridge") cartridges += qty;
    else other += qty;
  }
  const needPods = Number.isInteger(offer.pods) ? offer.pods : (offer.pod ? 1 : 0);
  if (!(pods === needPods && liquids === offer.liquids && cartridges === offer.cartridges)) return null;
  const otherSheet = items.reduce((sum, item) => {
    const category = String(item?.category || "").trim().toLowerCase();
    if (category === "pod" || category === "pods" || category === "liquids" || category === "cartridge") return sum;
    return sum + Number(item.price) * Number(item.quantity);
  }, 0);
  return { price: offer.price, otherSheet: Math.round(otherSheet * 100) / 100 };
}
