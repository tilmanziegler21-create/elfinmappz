import { preloadPlan } from "./productImage";

const started = new Set<string>();

function decodeOne(url: string) {
  if (!url || started.has(url)) return;
  started.add(url);
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    image.decode?.().catch(() => undefined);
  };
  image.onerror = () => {
    started.delete(url);
  };
  image.src = url;
}

function later(work: () => void) {
  const idle = window.requestIdleCallback;
  if (idle) idle(() => work(), { timeout: 1200 });
  else window.setTimeout(work, 700);
}

function settleImage(url: string) {
  return new Promise<void>((resolve) => {
    const image = new Image();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    image.decoding = "async";
    image.onload = () => {
      const decoded = image.decode?.();
      if (decoded && typeof decoded.then === "function") decoded.then(finish, finish);
      else finish();
    };
    image.onerror = finish;
    image.src = url;
    if (image.complete && image.naturalWidth > 0) finish();
  });
}

export function prewarmImages(urls: Array<string | undefined>, concurrency = 2) {
  const queue = urls.filter((url): url is string => Boolean(url));
  const unique = [...new Set(queue)];
  return new Promise<void>((resolve) => {
    if (!unique.length) {
      resolve();
      return;
    }
    let index = 0;
    let active = 0;
    const next = () => {
      if (index >= unique.length && active === 0) {
        resolve();
        return;
      }
      while (active < concurrency && index < unique.length) {
        const url = unique[index];
        index += 1;
        active += 1;
        settleImage(url).then(() => {
          active -= 1;
          next();
        });
      }
    };
    next();
  });
}

export function preloadImages(urls: Array<string | undefined>, when: "soon" | "idle" = "soon") {
  const plan = preloadPlan(urls);
  const queue = when === "idle" ? [...plan.soon, ...plan.later] : plan.soon;
  const deferred = when === "idle" ? [] : plan.later;
  if (when === "idle") later(() => queue.forEach(decodeOne));
  else queue.forEach(decodeOne);
  if (deferred.length) later(() => deferred.forEach(decodeOne));
}
