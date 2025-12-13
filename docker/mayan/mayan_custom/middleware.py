from __future__ import annotations

from urllib.parse import quote

from django.shortcuts import redirect


class AutoOIDCLoginMiddleware:
    """Redirect anonymous UI requests to OIDC SSO.

    Goal: user logs in once (Keycloak session) and Mayan UI opens without
    repeatedly prompting for credentials.

    IMPORTANT: must not interfere with backend-to-Mayan API calls.
    """

    def __init__(self, get_response):
        self.get_response = get_response

        # Paths that must remain reachable without triggering an OIDC redirect.
        # - /api/ is used by our Node backend to talk to Mayan.
        # - /oidc/ is the OIDC flow itself.
        # - /static/ and /media/ are assets.
        # - /health/ and /robots.txt are typical non-auth paths.
        self.allowed_prefixes = (
            "/api/",
            "/oidc/",
            "/static/",
            "/media/",
            "/favicon.ico",
        )

        self.allowed_exact = (
            "/robots.txt",
        )

    def __call__(self, request):
        # Determine authentication with minimal assumptions about middleware order.
        # - SessionMiddleware exposes request.session (preferred check)
        # - AuthenticationMiddleware exposes request.user
        try:
            session = getattr(request, 'session', None)
            if session and session.get('_auth_user_id'):
                return self.get_response(request)
        except Exception:
            pass

        user = getattr(request, "user", None)
        if user is not None and getattr(user, 'is_authenticated', False):
            return self.get_response(request)

        # Only redirect browser-style GET requests.
        if request.method != "GET":
            return self.get_response(request)

        path = request.path or "/"

        if path in self.allowed_exact:
            return self.get_response(request)

        if any(path.startswith(prefix) for prefix in self.allowed_prefixes):
            return self.get_response(request)

        # Avoid loops if we're already being sent to the default login.
        if path.startswith("/authentication/"):
            return self.get_response(request)

        next_url = request.get_full_path() or "/"
        return redirect(f"/oidc/authenticate/?next={quote(next_url)}")
