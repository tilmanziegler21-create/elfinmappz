import { commands, handleUpdate, httpsUrl, markup, parseUpdate } from "./bot.js";

async function call(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(30000),
  });
  const data = parseUpdate(await response.text());
  if (!response.ok || data.ok === false) {
    const error = new Error(data.description || "TELEGRAM_ERROR");
    error.code = "TELEGRAM_ERROR";
    throw error;
  }
  return data;
}

async function show(token, action) {
  if (action?.answer) await call(token, "answerCallbackQuery", { callback_query_id: action.answer.id, text: action.answer.text || undefined });
  const screen = action?.edit || action?.send;
  if (!screen) return;
  const payload = { chat_id: screen.chatId, text: screen.text, reply_markup: markup(screen.rows || []) };
  if (action.edit) {
    try {
      await call(token, "editMessageText", { ...payload, message_id: action.edit.messageId });
      return;
    } catch {
      await call(token, "sendMessage", payload);
      return;
    }
  }
  await call(token, "sendMessage", payload);
}

export async function dispatchUpdate(token, update, ctx) {
  const action = await handleUpdate(update, ctx);
  if (action && token) await show(token, action);
  return action;
}

export async function runPolling({ token, ctx, signal }) {
  await call(token, "deleteWebhook", { drop_pending_updates: false });
  await call(token, "setMyCommands", { commands });
  const url = httpsUrl(process.env.MINIAPP_PUBLIC_URL);
  if (url) {
    await call(token, "setChatMenuButton", { menu_button: { type: "web_app", text: "ELFIN", web_app: { url } } });
  }
  let offset = 0;
  while (!signal?.aborted) {
    let data;
    try {
      data = await call(token, "getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
    } catch (error) {
      if (signal?.aborted) return;
      if (error?.name === "TimeoutError") continue;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    for (const update of data.result || []) {
      offset = Number(update.update_id) + 1;
      try {
        const action = await handleUpdate(update, ctx);
        if (action) await show(token, action);
      } catch (error) {
        console.error("Bot update error:", error?.code || error?.message || "error");
      }
    }
  }
}
