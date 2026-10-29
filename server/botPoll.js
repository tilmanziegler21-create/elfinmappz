import { readFileSync } from "fs";
import { commands, handleUpdate, markup, menuButton, onceUpdate, parseUpdate, startLogoFile } from "./bot.js";

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
    error.status = response.status;
    throw error;
  }
  return data;
}

async function postForm(token, method, form) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  const data = parseUpdate(await response.text());
  if (!response.ok || data.ok === false) {
    const error = new Error(data.description || "TELEGRAM_ERROR");
    error.code = "TELEGRAM_ERROR";
    error.status = response.status;
    throw error;
  }
  return data;
}

function logoBlob() {
  return new Blob([readFileSync(startLogoFile)], { type: "image/jpeg" });
}

function photoForm(photo, styled) {
  const form = new FormData();
  form.set("chat_id", String(photo.chatId));
  form.set("caption", photo.caption);
  form.set("parse_mode", "HTML");
  form.set("reply_markup", JSON.stringify(markup(photo.rows || [], styled)));
  form.set("photo", logoBlob(), "elf.jpg");
  return form;
}

function hasStyle(rows) {
  return (rows || []).some((row) => (row || []).some((button) => button.style));
}

async function sendPhoto(token, photo) {
  try {
    await postForm(token, "sendPhoto", photoForm(photo, true));
  } catch (error) {
    if (error.status === 400 && hasStyle(photo.rows)) {
      await postForm(token, "sendPhoto", photoForm(photo, false));
      return;
    }
    throw error;
  }
}

async function sendText(token, method, payload, rows) {
  try {
    await call(token, method, { ...payload, reply_markup: markup(rows, true) });
  } catch (error) {
    if (error.status === 400 && hasStyle(rows)) {
      await call(token, method, { ...payload, reply_markup: markup(rows, false) });
      return;
    }
    throw error;
  }
}

async function show(token, action) {
  if (action?.answer) await call(token, "answerCallbackQuery", { callback_query_id: action.answer.id, text: action.answer.text || undefined });
  if (action?.photo) {
    await sendPhoto(token, action.photo);
    return;
  }
  const screen = action?.edit || action?.send;
  if (!screen) return;
  const payload = { chat_id: screen.chatId, text: screen.text };
  if (action.edit) {
    try {
      await sendText(token, "editMessageText", { ...payload, message_id: action.edit.messageId }, screen.rows || []);
      return;
    } catch {
      await sendText(token, "sendMessage", payload, screen.rows || []);
      return;
    }
  }
  await sendText(token, "sendMessage", payload, screen.rows || []);
}

export async function configureBot(token) {
  await call(token, "getMe");
  await call(token, "setMyCommands", { commands });
  const button = menuButton(process.env.MINIAPP_PUBLIC_URL);
  if (button) await call(token, "setChatMenuButton", { menu_button: button });
  await call(token, "setMyDescription", { description: "Каталог, корзина и история заказов — в одном приложении." });
  await call(token, "setMyShortDescription", { short_description: "ELFIN MARKET · Hamburg" });
  try {
    const form = new FormData();
    form.set("photo", JSON.stringify({ type: "static", photo: "attach://elf" }));
    form.set("elf", logoBlob(), "elf.jpg");
    await postForm(token, "setMyProfilePhoto", form);
  } catch (error) {
    console.error("Bot avatar:", error?.code || "error");
  }
}

export async function dispatchUpdate(token, update, ctx) {
  const action = await handleUpdate(update, ctx);
  if (action && token) await show(token, action);
  return action;
}

export async function runPolling({ token, ctx, signal }) {
  await call(token, "deleteWebhook", { drop_pending_updates: false });
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
        await onceUpdate(update, async () => {
          const action = await handleUpdate(update, ctx);
          if (action) await show(token, action);
        });
      } catch (error) {
        console.error("Bot update error:", error?.code || error?.message || "error");
      }
    }
  }
}
