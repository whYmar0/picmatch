import { chromium } from "@playwright/test";

const FRONTEND = "http://localhost:5173";
const API = "http://localhost:8000";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("[vite]")) errors.push(`console: ${m.text().slice(0, 150)}`); });

  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "hearttest@example.com", password: "Test1234!A" }),
  });
  const { access_token, user } = await res.json();

  await page.goto(`${FRONTEND}/login`);
  await page.evaluate(({ token, userObj }) => {
    localStorage.setItem("pickmatch_token", token);
    localStorage.setItem("pickmatch_user", JSON.stringify(userObj));
    sessionStorage.setItem("pickmatch_token", token);
    sessionStorage.setItem("pickmatch_user", JSON.stringify(userObj));
  }, { token: access_token, userObj: user });

  await page.goto(`${FRONTEND}/vote/invite123`);
  await page.waitForSelector("img[src*='http']", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const likeStamps = await page.getByText("НРАВИТСЯ", { exact: true }).count();
  const nopeStamps = await page.getByText("НЕ НРАВИТСЯ", { exact: true }).count();
  console.log("НРАВИТСЯ stamps:", likeStamps);
  console.log("НЕ НРАВИТСЯ stamps:", nopeStamps);

  // Drag slightly to make sure the stamps would have appeared before, still absent
  const card = page.locator(".relative.w-full.max-w-\\[430px\\]").first();
  const box = await card.boundingBox();
  const start = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.6 };
  const end = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.55 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.waitForTimeout(100);
  const midLike = await page.getByText("НРАВИТСЯ", { exact: true }).count();
  const midNope = await page.getByText("НЕ НРАВИТСЯ", { exact: true }).count();
  console.log("after partial drag — НРАВИТСЯ:", midLike, "НЕ НРАВИТСЯ:", midNope);
  await page.mouse.up();

  console.log(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors ✓");
  await browser.close();
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
