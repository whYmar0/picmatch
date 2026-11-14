import { test, expect } from "@playwright/test";

test("owner panel reads state, explicitly creates/resets/revokes and preserves revocation on reopen", async ({ page }) => {
  const user = { id: "owner", username: "Link owner", email: "owner@example.com", is_verified: true, role: "creator" };
  const album = { id: "album", title: "Link Test Album", description: null, invite_code: "old", invite_url: "https://pickmatch.site/vote/old",
    is_active: false, is_public: false, photo_count: 0, total_votes: 0, photos: [], creator: user, created_at: "2026-11-15T00:00:00Z" };
  let active = false;
  let code = "old";
  const mutations = [];
  await page.addInitScript(({ user }) => {
    localStorage.setItem("pickmatch_token", "local-fixture-token");
    localStorage.setItem("pickmatch_user", JSON.stringify(user));
    localStorage.setItem("pickmatch_lang", "en");
  }, { user });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    const method = route.request().method();
    if (path === "/api/auth/me") return route.fulfill({ json: user });
    if (path === "/api/albums/my") return route.fulfill({ json: [album] });
    if (path.startsWith("/api/albums/album/invitation")) {
      if (method !== "GET") {
        mutations.push(method + " " + path);
        active = method !== "DELETE";
        code = path.endsWith("/rotate") ? "reset-code" : "new-code";
      }
      return route.fulfill({ json: { is_active: active, invite_code: active ? code : null,
        invite_url: active ? `https://pickmatch.site/vote/${code}` : null } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: album.title })).toBeVisible();
  await page.getByTitle("Manage invitation link").click();
  await expect(page.getByRole("button", { name: "Create link", exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
  await page.getByRole("button", { name: "Create link", exact: true }).click();
  await expect(page.getByText("https://pickmatch.site/vote/new-code", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Regenerate link", exact: true }).click();
  expect(mutations).toHaveLength(1);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("https://pickmatch.site/vote/reset-code", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revoke link", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create link", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Create link", exact: true })).not.toBeVisible();
  await page.getByTitle("Manage invitation link").click();
  await expect(page.getByRole("button", { name: "Create link", exact: true })).toBeVisible();
  expect(mutations).toHaveLength(3);
});
