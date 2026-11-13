import test from "node:test";
import assert from "node:assert/strict";
import { createMediaAccess } from "../src/utils/mediaAccess.js";
import { isVideoUrl } from "../src/utils/media.js";

const source = "https://api.example.com/api/media/11111111-1111-4111-8111-111111111111?variant=display";

function fixture() {
  let token = "user-a";
  let now = 1_000_000;
  const calls = [];
  let handler = async (url) => ({ url: source + `&ticket=scope-${calls.length}`, expires_at: now / 1000 + 300 });
  const access = createMediaAccess({ apiBase: "https://api.example.com/api", origin: "https://web.example.com",
    getToken: () => token, now: () => now,
    request: async (url, credential) => { calls.push([url, credential]); return handler(url); } });
  return { access, calls, setToken: value => { token = value; }, setTime: value => { now = value; }, setHandler: value => { handler = value; } };
}

test("only the configured media origin can receive credentials", async () => {
  const f = fixture();
  for (const value of ["blob:https://web.example.com/file", "https://cdn.example.com/a.jpg", "/logo.png", source.replace("api.example.com", "evil.example.com")]) {
    assert.equal(await f.access.resolve(value), value);
  }
  assert.equal(f.calls.length, 0);
  await f.access.resolve(source);
  assert.equal(f.calls[0][0], source.replace("?variant=display", "/access?variant=display"));
  assert.equal(f.calls[0][1], "user-a");
});

test("ticket cache, pending deduplication, expiry and forced renewal", async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.access.resolve(source), f.access.resolve(source)]);
  assert.equal(a, b);
  assert.equal(f.calls.length, 1);
  assert.equal(await f.access.resolve(source), a);
  f.setTime(1_280_000);
  assert.notEqual(await f.access.resolve(source), a);
  assert.equal(f.calls.length, 2);
  await f.access.resolve(source, { force: true });
  assert.equal(f.calls.length, 3);
});

test("account change drops cached tickets and rejects a pending former-account response", async () => {
  const f = fixture();
  let finish;
  f.setHandler(() => new Promise(resolve => { finish = resolve; }));
  const old = f.access.resolve(source);
  await Promise.resolve();
  f.setToken("user-b");
  f.setHandler(async () => ({ url: source + "&ticket=new-account", expires_at: 1300 }));
  const current = await f.access.resolve(source);
  finish({ url: source + "&ticket=old-account", expires_at: 1300 });
  await assert.rejects(old, /session changed/i);
  assert.match(current, /new-account/);
  assert.equal(await f.access.resolve(source), current);
});

test("anonymous public media uses stable URL and clears private cached sources", async () => {
  const f = fixture();
  await f.access.resolve(source);
  f.setToken(null);
  assert.equal(await f.access.resolve(source), source);
  assert.equal(f.calls.length, 1);
  f.setToken("user-b");
  await f.access.resolve(source);
  assert.equal(f.calls.length, 2);
});

test("server cannot redirect a media element to another origin or photo", async () => {
  for (const [invalid, expiry] of [["https://evil.example.com/image", 1300], [source.replace("11111111", "22222222"), 1300], [source + "&ticket=expired", 900]]) {
    const f = fixture();
    f.setHandler(async () => ({ url: invalid, expires_at: expiry }));
    await assert.rejects(f.access.resolve(source));
  }
});

test("media URL hint preserves extensionless video previews", () => {
  assert.equal(isVideoUrl(source + "&media_type=video"), true);
  assert.equal(isVideoUrl(source), false);
});

test("cache remains bounded while browsing many files", async () => {
  let count = 0;
  const access = createMediaAccess({ apiBase: "https://api.example.com/api", origin: "https://web.example.com", getToken: () => "a",
    request: async url => { count += 1; return { url: url.replace("/access?", "?") + "&ticket=fixed", expires_at: Date.now() / 1000 + 300 }; } });
  for (let id = 0; id < 257; id += 1) {
    await access.resolve(source.replace("11111111-1111-4111-8111-111111111111", `11111111-1111-4111-8111-${String(id).padStart(12, "0")}`));
  }
  await access.resolve(source.replace("11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-000000000000"));
  assert.equal(count, 258);
});

test("production CSP permits protected API images and videos", async () => {
  const { readFile } = await import("node:fs/promises");
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const policy = config.headers.flatMap(rule => rule.headers).find(header => header.key === "Content-Security-Policy").value;
  const directives = Object.fromEntries(policy.split(";").filter(value => value.trim()).map(value => {
    const [name, ...sources] = value.trim().split(/\s+/);
    return [name, sources];
  }));
  for (const name of ["img-src", "media-src"]) assert.ok(directives[name].includes("https://pickmatch-api.onrender.com"), name);
});

test("Vite proxy rewrites only the known local backend origin", async () => {
  let called;
  const local = "http://localhost:8000/api/media/11111111-1111-4111-8111-111111111111?variant=thumbnail";
  const access = createMediaAccess({ apiBase: "/api", origin: "http://localhost:5173", getToken: () => "a",
    request: async url => { called = url; return { url: local + "&ticket=local", expires_at: Date.now() / 1000 + 300 }; } });
  assert.match(await access.resolve(local), /^http:\/\/localhost:5173\/api\/media\/.*ticket=local/);
  assert.match(called, /^http:\/\/localhost:5173\/api\/media\//);
});
