import { copyKeys, language, t } from "./botCopy.js";

const PAGE = 5;
const hits = new Map();
const sessions = new Map();

const STATUS = {
  ru: { buffer: "Черновик", pending: "Ожидает", assigned: "Назначен", picked_up: "В пути", delivered: "Выдан", cancelled: "Отменён" },
  de: { buffer: "Entwurf", pending: "Wartet", assigned: "Zugewiesen", picked_up: "Unterwegs", delivered: "Übergeben", cancelled: "Storniert" },
  en: { buffer: "Draft", pending: "Waiting", assigned: "Assigned", picked_up: "On the way", delivered: "Delivered", cancelled: "Cancelled" },
};

export function parseUpdate(raw) {
  const safe = String(raw).replace(/"(id|user_id)"\s*:\s*(\d{16,})/g, '"$1":"$2"');
  return JSON.parse(safe);
}

export function httpsUrl(value) {
  const url = String(value || "").trim();
  if (!url.startsWith("https://")) return "";
  return url;
}

function session(chatId) {
  const key = String(chatId);
  if (!sessions.has(key)) sessions.set(key, {});
  return sessions.get(key);
}

function limited(chatId) {
  const now = Date.now();
  const next = (hits.get(String(chatId)) || []).filter((time) => now - time < 10_000);
  if (next.length >= 25) {
    hits.set(String(chatId), next);
    return true;
  }
  next.push(now);
  hits.set(String(chatId), next);
  return false;
}

function euro(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number.toFixed(2).replace(".", ",")} €`;
}

function when(value) {
  const text = String(value || "");
  return text ? text.slice(0, 16).replace("T", " ") : "—";
}

function statusName(lang, status) {
  return (STATUS[lang] || STATUS.ru)[status] || status || "—";
}

function shopButton(lang, url) {
  if (!url) return { text: t(lang, "shop"), callback_data: "m:nourl" };
  return { text: t(lang, "shop"), web_app: { url } };
}

function customerKeyboard(lang, url, user) {
  const rows = [
    [shopButton(lang, url)],
    [{ text: t(lang, "orders"), callback_data: "m:orders:0" }, { text: t(lang, "profile"), callback_data: "m:profile" }],
    [{ text: t(lang, "support"), callback_data: "m:support" }, { text: t(lang, "info"), callback_data: "m:info" }],
  ];
  if (user?.courier) rows.push([{ text: t(lang, "courierTitle"), callback_data: "c:home" }]);
  if (user?.admin) rows.push([{ text: t(lang, "admin"), callback_data: "a:home" }]);
  return rows;
}

function view(text, rows) {
  return { text, rows };
}

function actor(user) {
  return { tgId: String(user.tg_id), admin: user.status === "admin", courier: user.status === "courier" };
}

async function customerHome(user, ctx) {
  const lang = user.lang || "ru";
  return view(t(lang, "welcome"), customerKeyboard(lang, httpsUrl(ctx.miniAppUrl), actor(user)));
}

async function ordersPage(user, ctx, page) {
  const lang = user.lang || "ru";
  const orders = await ctx.ordersFor(user.tg_id);
  if (!orders.length) {
    return view(t(lang, "emptyOrders"), [[shopButton(lang, httpsUrl(ctx.miniAppUrl))], [{ text: t(lang, "back"), callback_data: "m:home" }]]);
  }
  const start = Math.max(0, page) * PAGE;
  const slice = orders.slice(start, start + PAGE);
  const lines = [t(lang, "ordersTitle"), ""];
  for (const order of slice) {
    lines.push(`📦 ${order.id}`, `${statusName(lang, order.status)} · ${euro(order.final_amount ?? order.total_amount)}`, when(order.created_at), "");
  }
  const rows = slice.map((order) => [{ text: `${t(lang, "more")} ${order.id}`, callback_data: `m:od:${order.id}` }]);
  const nav = [];
  if (start > 0) nav.push({ text: t(lang, "prev"), callback_data: `m:orders:${page - 1}` });
  if (start + PAGE < orders.length) nav.push({ text: t(lang, "next"), callback_data: `m:orders:${page + 1}` });
  if (nav.length) rows.push(nav);
  rows.push([{ text: t(lang, "back"), callback_data: "m:home" }]);
  return view(lines.join("\n").trim(), rows);
}

async function orderDetail(user, ctx, orderId) {
  const lang = user.lang || "ru";
  const order = await ctx.orderFor(user.tg_id, orderId);
  if (!order) return view(t(lang, "missing"), [[{ text: t(lang, "back"), callback_data: "m:orders:0" }]]);
  const items = await ctx.items(order.id);
  const lines = [
    `📦 ${order.id}`,
    "",
    statusName(lang, order.status),
    euro(order.final_amount ?? order.total_amount),
    when(order.created_at),
    order.delivery_method || "—",
    [order.delivery_date, order.delivery_time, order.delivery_address].filter(Boolean).join(" · ") || "—",
    "",
    ...items.map((item) => `${item.name} × ${item.quantity}`),
  ];
  return view(lines.join("\n"), [[{ text: t(lang, "back"), callback_data: "m:orders:0" }]]);
}

async function profileView(user, ctx) {
  const lang = user.lang || "ru";
  const profile = await ctx.profile(user);
  const name = user.first_name || "—";
  const username = user.username ? `@${user.username}` : "—";
  const text = [
    t(lang, "profileTitle"),
    "",
    `${t(lang, "profileName")}: ${name}`,
    `${t(lang, "profileUser")}: ${username}`,
    `${t(lang, "profileCity")}: Hamburg`,
    `${t(lang, "profileDone")}: ${profile.delivered}`,
    `${t(lang, "profileLast")}: ${when(profile.last)}`,
    `${t(lang, "profileLevel")}: ${profile.level} / 10`,
  ].join("\n");
  return view(text, [
    [{ text: t(lang, "orders"), callback_data: "m:orders:0" }],
    [shopButton(lang, httpsUrl(ctx.miniAppUrl))],
    [{ text: t(lang, "back"), callback_data: "m:home" }],
  ]);
}

async function supportHome(user, ctx) {
  const lang = user.lang || "ru";
  const orders = (await ctx.ordersFor(user.tg_id)).slice(0, 5);
  const rows = orders.map((order) => [{ text: order.id, callback_data: `m:sup:${order.id}` }]);
  rows.push([{ text: t(lang, "supportFree"), callback_data: "m:sup:none" }]);
  rows.push([{ text: t(lang, "back"), callback_data: "m:home" }]);
  const manager = ctx.managerId ? "" : `\n\n${t(lang, "supportNoManager")}`;
  return view(`${t(lang, "supportPick")}${manager}`, rows);
}

function courierHome(user) {
  const lang = user.lang || "ru";
  return view(t(lang, "courierTitle"), [
    [{ text: t(lang, "courierOrders"), callback_data: "c:list:all" }],
    [{ text: t(lang, "courierActive"), callback_data: "c:list:active" }, { text: t(lang, "courierDone"), callback_data: "c:list:done" }],
    [{ text: t(lang, "customerHome"), callback_data: "m:home" }],
  ]);
}

async function courierList(user, ctx, mode) {
  const lang = user.lang || "ru";
  if (user.status !== "courier" && user.status !== "admin") return view(t(lang, "denied"), [[{ text: t(lang, "back"), callback_data: "m:home" }]]);
  const orders = await ctx.courierOrders(user, mode);
  if (!orders.length) return view(t(lang, "none"), [[{ text: t(lang, "back"), callback_data: "c:home" }]]);
  const rows = orders.slice(0, PAGE).map((order) => [{ text: order.id, callback_data: `c:od:${order.id}` }]);
  rows.push([{ text: t(lang, "back"), callback_data: "c:home" }]);
  return view(t(lang, "courierTitle"), rows);
}

async function courierCard(user, ctx, orderId) {
  const lang = user.lang || "ru";
  const order = await ctx.courierOrder(user, orderId);
  if (!order) return view(t(lang, "missing"), [[{ text: t(lang, "back"), callback_data: "c:home" }]]);
  const text = [
    `📦 ${order.id}`,
    when(order.delivery_time ? `${order.delivery_date} ${order.delivery_time}` : order.created_at),
    order.delivery_method || "—",
    order.delivery_address || "—",
    euro(order.final_amount ?? order.total_amount),
    ...(order.lines || []).map((item) => `${item.name} × ${item.quantity}`),
    order.username ? `@${order.username}` : "—",
    order.contact || "—",
    order.comment || "—",
  ].join("\n");
  const open = ["pending", "assigned", "picked_up"].includes(order.status);
  const rows = open
    ? [[{ text: t(lang, "delivered"), callback_data: `c:ask:${order.id}` }, { text: t(lang, "notDelivered"), callback_data: `c:why:${order.id}` }]]
    : [];
  rows.push([{ text: t(lang, "back"), callback_data: "c:list:all" }]);
  return view(text, rows);
}

function adminHome(user) {
  const lang = user.lang || "ru";
  if (user.status !== "admin") return view(t(lang, "denied"), [[{ text: t(lang, "back"), callback_data: "m:home" }]]);
  return view(t(lang, "adminTitle"), [
    [{ text: t(lang, "summary"), callback_data: "a:sum" }],
    [{ text: t(lang, "adminOrders"), callback_data: "a:orders" }, { text: t(lang, "adminCouriers"), callback_data: "a:couriers" }],
    [{ text: t(lang, "adminHealth"), callback_data: "a:health" }, { text: t(lang, "adminTickets"), callback_data: "a:tickets" }],
    [{ text: t(lang, "back"), callback_data: "m:home" }],
  ]);
}

async function route(user, data, ctx, state) {
  const lang = user.lang || "ru";
  const [scope, action, extra] = String(data || "").split(":");
  if (scope === "m" && action === "home") return customerHome(user, ctx);
  if (scope === "m" && action === "nourl") return view(t(lang, "noUrl"), [[{ text: t(lang, "back"), callback_data: "m:home" }]]);
  if (scope === "m" && action === "orders") return ordersPage(user, ctx, Number(extra || 0));
  if (scope === "m" && action === "od") return orderDetail(user, ctx, extra);
  if (scope === "m" && action === "profile") return profileView(user, ctx);
  if (scope === "m" && action === "info") return view(t(lang, "infoBody"), [[{ text: t(lang, "back"), callback_data: "m:home" }]]);
  if (scope === "m" && action === "support") return supportHome(user, ctx);
  if (scope === "m" && action === "sup") {
    state.pending = { type: "support", orderId: extra === "none" ? "" : extra };
    return view(t(lang, "supportAsk"), [[{ text: t(lang, "back"), callback_data: "m:support" }]]);
  }
  if (scope === "c" && action === "home") {
    if (user.status !== "courier" && user.status !== "admin") return view(t(lang, "denied"), [[{ text: t(lang, "back"), callback_data: "m:home" }]]);
    return courierHome(user);
  }
  if (scope === "c" && action === "list") return courierList(user, ctx, extra || "all");
  if (scope === "c" && action === "od") return courierCard(user, ctx, extra);
  if (scope === "c" && action === "ask") {
    return view(`${t(lang, "confirmDeliver")}\n${extra}`, [
      [{ text: t(lang, "yes"), callback_data: `c:go:${extra}` }],
      [{ text: t(lang, "back"), callback_data: `c:od:${extra}` }],
    ]);
  }
  if (scope === "c" && action === "go") {
    const result = await ctx.deliver(user, extra);
    const text = result?.ok ? t(lang, "doneDeliver") : t(lang, result?.closed ? "already" : "denied");
    return view(text, [[{ text: t(lang, "back"), callback_data: "c:home" }]]);
  }
  if (scope === "c" && action === "why") {
    state.pending = { type: "cancel", orderId: extra };
    return view(t(lang, "askReason"), [[{ text: t(lang, "back"), callback_data: `c:od:${extra}` }]]);
  }
  if (scope === "a") {
    if (user.status !== "admin") return view(t(lang, "denied"), [[{ text: t(lang, "back"), callback_data: "m:home" }]]);
    if (action === "home") return adminHome(user);
    if (action === "sum") return view(await ctx.summaryText(), [[{ text: t(lang, "back"), callback_data: "a:home" }]]);
    if (action === "orders") return view(await ctx.adminOrdersText(), [[{ text: t(lang, "back"), callback_data: "a:home" }]]);
    if (action === "couriers") return view(await ctx.adminCouriersText(), [[{ text: t(lang, "back"), callback_data: "a:home" }]]);
    if (action === "health") return view(await ctx.healthText(), [[{ text: t(lang, "back"), callback_data: "a:home" }]]);
    if (action === "tickets") return view(await ctx.ticketsText(), [[{ text: t(lang, "back"), callback_data: "a:home" }]]);
  }
  return customerHome(user, ctx);
}

function commandOf(text) {
  const word = String(text || "").trim().split(/\s+/)[0].split("@")[0].toLowerCase();
  if (word === "/start" || word === "/shop" || word === "/orders" || word === "/profile" || word === "/help" || word === "/admin") return word;
  return "";
}

export async function handleUpdate(update, ctx) {
  const callback = update.callback_query;
  if (callback) {
    const from = callback.from || {};
    const chatId = String(callback.message?.chat?.id ?? from.id);
    const lang = language(from.language_code);
    if (limited(chatId)) {
      return { answer: { id: callback.id, text: t(lang, "rate") } };
    }
    try {
      const user = ctx.ensureUser(from);
      user.lang = user.lang || lang;
      const state = session(chatId);
      const screen = await route(user, callback.data, ctx, state);
      const messageId = callback.message?.message_id;
      return {
        answer: { id: callback.id, text: "" },
        edit: messageId ? { chatId, messageId, ...screen } : null,
        send: messageId ? null : { chatId, ...screen },
      };
    } catch {
      return { answer: { id: callback.id, text: t(lang, "fail") } };
    }
  }
  const message = update.message;
  if (!message?.from || message.chat?.id == null) return null;
  const chatId = String(message.chat.id);
  const lang = language(message.from.language_code);
  if (limited(chatId)) return { send: { chatId, text: t(lang, "rate"), rows: [] } };
  const user = ctx.ensureUser(message.from);
  user.lang = user.lang || lang;
  const state = session(chatId);
  const command = commandOf(message.text);
  if (command) state.pending = null;
  let screen;
  if (command === "/start") screen = user.status === "courier" ? courierHome(user) : await customerHome(user, ctx);
  else if (command === "/shop") screen = httpsUrl(ctx.miniAppUrl) ? await customerHome(user, ctx) : view(t(user.lang, "noUrl"), customerKeyboard(user.lang, "", actor(user)));
  else if (command === "/orders") screen = await ordersPage(user, ctx, 0);
  else if (command === "/profile") screen = await profileView(user, ctx);
  else if (command === "/help") screen = view(`${t(user.lang, "help")}\n\n${t(user.lang, "infoBody")}`, [[{ text: t(user.lang, "support"), callback_data: "m:support" }], [{ text: t(user.lang, "back"), callback_data: "m:home" }]]);
  else if (command === "/admin") screen = adminHome(user);
  else if (state.pending?.type === "support") {
    const text = String(message.text || "").trim();
    if (!text || text.length > 1000) screen = view(t(user.lang, "supportAsk"), [[{ text: t(user.lang, "back"), callback_data: "m:home" }]]);
    else {
      const ticket = await ctx.saveTicket(user, state.pending.orderId, text);
      state.pending = null;
      screen = view(`${t(user.lang, "supportDone")}\n${ticket.id}`, [[{ text: t(user.lang, "back"), callback_data: "m:home" }]]);
    }
  } else if (state.pending?.type === "cancel") {
    const reason = String(message.text || "").trim();
    if (!reason || reason.length > 200) screen = view(t(user.lang, "reasonBad"), [[{ text: t(user.lang, "back"), callback_data: "c:home" }]]);
    else {
      const result = await ctx.cancel(user, state.pending.orderId, reason);
      state.pending = null;
      const text = result?.ok ? t(user.lang, "doneCancel") : t(user.lang, result?.closed ? "already" : "denied");
      screen = view(text, [[{ text: t(user.lang, "back"), callback_data: "c:home" }]]);
    }
  } else screen = await customerHome(user, ctx);
  return { send: { chatId, ...screen } };
}

export function markup(rows) {
  return { inline_keyboard: rows };
}

export const commands = [
  { command: "start", description: "Меню" },
  { command: "shop", description: "Mini App" },
  { command: "orders", description: "Мои заказы" },
  { command: "profile", description: "Профиль" },
  { command: "help", description: "Информация" },
];

export function sameCopyKeys() {
  return copyKeys;
}
