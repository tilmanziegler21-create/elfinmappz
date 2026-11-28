const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const LEVELS = [
  { id: "SILVER", from: 0, percent: 0 },
  { id: "GOLD", from: 40, percent: 2 },
  { id: "PLATINUM", from: 90, percent: 5 },
  { id: "LEGEND", from: 150, percent: 8 },
];

export function codeFor(tgId) {
  let n = BigInt(String(tgId || "").replace(/\D/g, "") || "0");
  if (n <= 0n) return "ELFIN-AAAA";
  let out = "";
  while (n > 0n) {
    out = ABC[Number(n % 32n)] + out;
    n /= 32n;
  }
  return `ELFIN-${out}`;
}

export function tgIdFromCode(code) {
  const raw = String(code || "").trim().toUpperCase().replace(/^ELFIN-/, "");
  if (!raw || [...raw].some((char) => !ABC.includes(char))) return "";
  let n = 0n;
  for (const char of raw) n = n * 32n + BigInt(ABC.indexOf(char));
  const id = n.toString();
  return /^\d{1,24}$/.test(id) ? id : "";
}

export function levelFor(spent) {
  const value = Math.max(0, Number(spent) || 0);
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (value + 0.001 >= level.from) current = level;
  }
  const next = LEVELS.find((level) => level.from > current.from) || null;
  return {
    id: current.id,
    percent: current.percent,
    toNext: next ? Math.round((next.from - value) * 100) / 100 : 0,
    next: next?.id || "",
  };
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function paidAmount(order) {
  const status = String(order?.status || "").toLowerCase();
  if (!order?.payment_method || status === "cancelled") return 0;
  const amount = Number(order.final_amount ?? order.total_amount);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function clubSnapshot(user, users, orders, rules) {
  const id = String(user?.tg_id || "");
  const list = Object.values(orders || {});
  const mine = list.filter((order) => String(order?.user_id || "") === id);
  const spent = money(mine.reduce((sum, order) => sum + paidAmount(order), 0));
  const level = levelFor(spent);
  const invites = Object.values(users || {})
    .filter((item) => item && String(item.referred_by || "") === id)
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const ledger = mine
    .filter((order) => order.payment_method)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return {
    code: codeFor(id),
    points: money(user?.bonus_balance),
    spent,
    level: level.id,
    percent: level.percent,
    toNext: level.toNext,
    next: level.next,
    referredBy: user?.referred_by ? codeFor(user.referred_by) : "",
    cashbackPercent: Number(rules?.cashbackPercent || 0),
    referralEvery: Number(rules?.referralEvery || 0),
    referralBonus: Number(rules?.referralBonus || 0),
    invites: invites.map((item, index) => ({
      no: String(index + 1).padStart(3, "0"),
      name: item.first_name || item.username || codeFor(item.tg_id),
      confirmed: Boolean(item.first_paid_order_at),
    })),
    ledger: ledger.map((order) => ({
      id: String(order.display_number || order.id || ""),
      at: String(order.created_at || "").slice(0, 10),
      points: money(Number(order.cashback_earned || 0) - Number(order.bonus_applied || 0)),
    })),
  };
}
