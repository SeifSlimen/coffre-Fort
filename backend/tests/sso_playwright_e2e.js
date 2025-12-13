const { chromium } = require('playwright');

function env(name, fallback) {
  return process.env[name] && process.env[name].trim() ? process.env[name].trim() : fallback;
}

async function main() {
  const mayanBase = env('MAYAN_BASE_URL', 'http://localhost:8000');
  const keycloakBase = env('KEYCLOAK_BASE_URL', 'http://localhost:8081');
  const username = env('SSO_USERNAME', 'user@test.com');
  const password = env('SSO_PASSWORD', 'user123');

  console.log(`Mayan: ${mayanBase}`);
  console.log(`Keycloak: ${keycloakBase}`);
  console.log(`User: ${username}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1) Start at Mayan root; should redirect into Keycloak login.
    const resp = await page.goto(`${mayanBase}/`, { waitUntil: 'domcontentloaded' });
    if (!resp) {
      throw new Error('No response when navigating to Mayan /');
    }

    await page.waitForURL((url) => url.href.startsWith(`${keycloakBase}/`), { timeout: 30000 });

    // 2) Fill Keycloak login form.
    await page.waitForSelector('input[name="username"], input#username', { timeout: 30000 });
    await page.fill('input[name="username"], input#username', username);
    await page.fill('input[name="password"], input#password', password);

    // Keycloak templates commonly use input[name=login] for submit.
    const loginSelector = 'input[name="login"], button[name="login"], button[type="submit"], input[type="submit"]';
    await page.click(loginSelector);

    // 3) Wait for redirect back to Mayan.
    await page.waitForURL((url) => url.href.startsWith(`${mayanBase}/`), { timeout: 30000 });

    // 4) Basic assertion: after auth, Mayan should not bounce back to /oidc/authenticate.
    const finalUrl = page.url();
    console.log(`Final URL: ${finalUrl}`);
    if (finalUrl.includes('/oidc/authenticate')) {
      throw new Error(`SSO E2E FAILED: still at OIDC authenticate: ${finalUrl}`);
    }

    const content = await page.content();
    if (/Sign in to Coffre-Fort Documentaire/i.test(content)) {
      throw new Error('SSO E2E FAILED: still seeing Keycloak login page');
    }

    console.log('SSO E2E PASSED');
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
