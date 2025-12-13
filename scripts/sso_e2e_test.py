import os
import re
import sys
import time
import html
from urllib.parse import urljoin

import requests


MAYAN_BASE = os.getenv("MAYAN_BASE", "http://localhost:8000")
KEYCLOAK_BASE = os.getenv("KEYCLOAK_BASE", "http://localhost:8081")
USERNAME = os.getenv("SSO_USERNAME", "user@test.com")
PASSWORD = os.getenv("SSO_PASSWORD", "user123")

TIMEOUT = float(os.getenv("SSO_TIMEOUT", "15"))
RETRIES = int(os.getenv("SSO_RETRIES", "30"))
SLEEP = float(os.getenv("SSO_RETRY_SLEEP", "1"))


def wait_http_ok(url: str) -> None:
    last_exc: Exception | None = None
    for _ in range(RETRIES):
        try:
            r = requests.get(url, timeout=TIMEOUT)
            if r.status_code < 500:
                return
        except Exception as exc:
            last_exc = exc
        time.sleep(SLEEP)
    raise RuntimeError(f"Service not reachable: {url}. Last error: {last_exc}")


def get_keycloak_login_form(session: requests.Session, auth_url: str) -> tuple[str, dict[str, str]]:
    # Load login page
    r = session.get(auth_url, timeout=TIMEOUT)
    r.raise_for_status()

    set_cookie = r.headers.get("Set-Cookie")
    if set_cookie:
        print("Keycloak Set-Cookie (first response header):", set_cookie[:200])

    # Dump cookies currently in the session (helps debug Keycloak cookie_not_found)
    try:
        jar = list(session.cookies)
        if jar:
            print("Session cookies after login page:")
            for c in jar:
                print(f"  {c.name} domain={c.domain} path={c.path} secure={c.secure}")
        else:
            print("Session cookies after login page: (none)")
    except Exception:
        pass

    # Find the Keycloak login form action
    # Example: <form id="kc-form-login" ... action="/realms/.../login-actions/authenticate?..." method="post">
    m = re.search(r"<form[^>]+id=\"kc-form-login\"[^>]+action=\"([^\"]+)\"", r.text)
    if not m:
        raise RuntimeError("Could not find Keycloak login form (kc-form-login)")

    # Keycloak's HTML often entity-escapes query params as &amp;.
    # If we don't unescape, we post to a broken URL (amp;execution=...),
    # and Keycloak will not authenticate.
    action = html.unescape(m.group(1))
    action_url = action if action.startswith("http") else urljoin(KEYCLOAK_BASE, action)

    # Collect hidden inputs (some realms/themes include them)
    hidden_inputs = dict(re.findall(r"<input[^>]+type=\"hidden\"[^>]+name=\"([^\"]+)\"[^>]+value=\"([^\"]*)\"", r.text))
    return action_url, hidden_inputs


def main() -> int:
    print(f"Mayan: {MAYAN_BASE}")
    print(f"Keycloak: {KEYCLOAK_BASE}")
    print(f"User: {USERNAME}")

    # Wait for services to be up
    wait_http_ok(f"{MAYAN_BASE}/authentication/login/")
    wait_http_ok(f"{KEYCLOAK_BASE}/realms/coffre-fort/")

    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
    )

    # Step 1: start OIDC flow
    start_url = f"{MAYAN_BASE}/oidc/authenticate/?next=/"
    r0 = s.get(start_url, allow_redirects=False, timeout=TIMEOUT)
    if r0.status_code not in (302, 303):
        raise RuntimeError(f"Expected redirect from {start_url}, got {r0.status_code}")

    auth_url = r0.headers.get("Location")
    if not auth_url:
        raise RuntimeError("No Location header from /oidc/authenticate")

    # auth_url is usually absolute to localhost:8081; make sure it's absolute
    if auth_url.startswith("/"):
        auth_url = urljoin(KEYCLOAK_BASE, auth_url)

    print("Auth URL:", auth_url)

    # Step 2: Keycloak login
    action_url, hidden = get_keycloak_login_form(s, auth_url)
    # Keycloak login form expects these names (seen in the HTML):
    # - username, password
    # - login (submit button)
    # - credentialId (often empty)
    payload = {
        **hidden,
        "username": USERNAME,
        "password": PASSWORD,
        "credentialId": hidden.get("credentialId", ""),
        "login": hidden.get("login", "Log in"),
    }

    r1 = s.post(action_url, data=payload, allow_redirects=True, timeout=TIMEOUT)
    final_url = r1.url
    print("POST status:", r1.status_code)
    if r1.history:
        print("Redirect chain:")
        for h in r1.history:
            print(" ", h.status_code, h.url)
            loc = h.headers.get("Location")
            if loc:
                print("    Location:", loc)
    loc_final = r1.headers.get("Location")
    if loc_final:
        print("Final Location header:", loc_final)
    print("Final URL:", final_url)

    # If we are still on Keycloak after posting credentials, surface a useful error.
    if final_url.startswith(KEYCLOAK_BASE):
        page = (r1.text or "")
        print("Final response content-type:", r1.headers.get("Content-Type"))
        print("Final response body prefix:", page[:300].replace("\n", " "))
        # Common Keycloak error markers
        if "Invalid username or password" in page:
            raise RuntimeError("Keycloak rejected credentials (invalid username or password)")
        if "kc-form-login" in page:
            raise RuntimeError(
                "Keycloak login did not complete (still on login form). "
                "This usually means the form action URL was wrong or Keycloak session params were invalid."
            )

    # Step 3: verify Mayan root is authenticated (should NOT redirect to /oidc/authenticate)
    r2 = s.get(f"{MAYAN_BASE}/", allow_redirects=False, timeout=TIMEOUT)
    if r2.status_code in (301, 302, 303, 307, 308):
        loc = r2.headers.get("Location", "")
        raise RuntimeError(f"Still redirected after login: {r2.status_code} Location={loc}")

    if r2.status_code != 200:
        raise RuntimeError(f"Unexpected status for Mayan root after login: {r2.status_code}")

    print("OK: Mayan root returned 200 and did not redirect (SSO session established).")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print("SSO E2E FAILED:", exc)
        sys.exit(1)
