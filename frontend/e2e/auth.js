const API = process.env.E2E_API_URL || "http://localhost:8000";

let cachedAuth = null;

export async function getAuthToken() {
  if (cachedAuth) return cachedAuth;

  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "tester@example.com",
      password: "Test1234!A",
    }),
  });

  if (!res.ok) {
    throw new Error(`Login failed: ${await res.text()}`);
  }

  cachedAuth = await res.json();
  return cachedAuth;
}

export async function loginPage(page, frontendUrl) {
  const { access_token, user } = await getAuthToken();
  await page.goto(`${frontendUrl}/login`);
  await page.evaluate(({ token, userObj }) => {
    const raw = JSON.stringify(userObj);
    localStorage.setItem("pickmatch_token", token);
    localStorage.setItem("pickmatch_user", raw);
    sessionStorage.setItem("pickmatch_token", token);
    sessionStorage.setItem("pickmatch_user", raw);
  }, { token: access_token, userObj: user });
}
