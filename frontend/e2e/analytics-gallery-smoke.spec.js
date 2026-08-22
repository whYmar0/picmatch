import { test, expect } from "@playwright/test";

const API = process.env.E2E_API_URL || "http://localhost:8000";
const FRONTEND = process.env.E2E_BASE_URL || "http://localhost:5173";

const user = {
  id: "analytics-gallery-smoke-user",
  email: "analytics-gallery-smoke@example.com",
  username: "Analytics Smoke",
  role: "creator",
  is_verified: true,
};

const photo = {
  id: "analytics-gallery-smoke-photo",
  filename: "smoke.svg",
  url: `${FRONTEND}/analytics-gallery-smoke.svg`,
  media_type: "image",
  order: 0,
};

const analytics = {
  id: "analytics-gallery-smoke-album",
  title: "Analytics Gallery Smoke",
  description: null,
  creator_id: user.id,
  creator: user,
  is_public: true,
  total_photos: 1,
  total_votes: 1,
  unique_voters: 1,
  global_like_rate: 100,
  voter_summaries: [],
  photos: [{ ...photo, like_count: 1, dislike_count: 0, total_votes: 1, like_percentage: 100, reactions: [] }],
  winner: null,
  created_at: "2026-01-01T00:00:00Z",
  is_shared: false,
  can_view_stats: true,
};

test("analytics route uses the shared gallery flow", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text());
  });

  await page.route(`${API}/api/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/auth/me") return route.fulfill({ json: user });
    if (pathname === `/api/albums/${analytics.id}/analytics`) return route.fulfill({ json: analytics });
    if (pathname.startsWith("/api/comments/photo/")) return route.fulfill({ json: [] });
    if (pathname === "/api/notifications/") return route.fulfill({ json: [] });
    return route.continue();
  });

  await page.route("**/analytics-gallery-smoke.svg", async (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"300\"><rect width=\"400\" height=\"300\" fill=\"#9966cc\"/></svg>",
  }));

  await page.addInitScript(({ currentUser }) => {
    localStorage.setItem("pickmatch_token", "analytics-gallery-smoke-token");
    localStorage.setItem("pickmatch_user", JSON.stringify(currentUser));
  }, { currentUser: user });

  await page.goto(`${FRONTEND}/analytics/${analytics.id}`);
  await expect(page.getByTestId("album-gallery")).toBeVisible();
  await expect(page.getByTestId("gallery-pill-bar")).toBeVisible();
  await page.getByTestId("gallery-pill-bar").click();
  await expect(page.getByTestId("primary-stats-sheet")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Статистика" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Комментарии" })).toBeVisible();
  await expect(page.getByTestId("stats-photo-0")).toBeVisible();
  expect(errors).toEqual([]);
});
