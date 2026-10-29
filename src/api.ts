export type SessionUser = {
  tgId: string;
  username: string;
  firstName: string;
  lastName?: string;
  status: string;
};

export type AuthPhase = "initializing" | "authenticated" | "unauthenticated" | "expired" | "error";

export type Session = {
  token: string;
  user: SessionUser;
  dev: boolean;
  city: string;
};

export type ApiCourier = {
  courier_id: string;
  name: string;
  tg_id: string;
  time_from: string;
  time_to: string;
  meeting_place: string;
  slots: string[];
};

export type ApiOrder = {
  orderId: string;
  status: string;
  totalAmount: number;
  finalAmount: number | null;
  deliveryMethod: string;
  time: string;
  date: string;
  place: string;
  comment: string;
  courierId: string;
  writeCourier?: { url?: string; start?: string };
  lines: { name: string; variant: string; qty: number }[];
  units: number;
  customerName?: string;
  username?: string;
  tgId?: string;
  phone?: string;
  payout?: number;
};

export const customerStatus: Record<string, string> = {
  buffer: "В обработке",
  pending: "Ожидает",
  assigned: "Курьер назначен",
  picked_up: "В пути",
  delivered: "Доставлен",
  cancelled: "Отменён",
};

export const courierStatus: Record<string, string> = {
  pending: "Ожидает",
  assigned: "Назначен",
  picked_up: "В работе",
  delivered: "Выдано",
  cancelled: "Не выдано",
};

function apiUrl(path: string) {
  const base = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  return `${base}${path}`;
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}) {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: options.method || "GET",
      headers: {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error("Сервер не ответил.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка запроса");
  return data as T;
}

export function todayDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function askTelegram(message: string) {
  const telegram = (window as unknown as { Telegram?: { WebApp?: { showConfirm?: (text: string, cb: (ok: boolean) => void) => void } } }).Telegram?.WebApp;
  if (!telegram?.showConfirm) return Promise.resolve<boolean | null>(null);
  return new Promise<boolean>((resolve) => telegram.showConfirm?.(message, (ok) => resolve(Boolean(ok))));
}
