"""Custom OIDC views.

Goal: make the Keycloak -> Mayan redirect resilient even when the browser
doesn't reliably preserve Django's session cookie across the round trip.

We store the OIDC state+nonce in a signed cookie and rehydrate the session
for `mozilla-django-oidc` callback processing.
"""

import logging
import time
from urllib.parse import urlencode

from django.conf import settings
from django.contrib import auth
from django.core import signing
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.utils.crypto import get_random_string

from mozilla_django_oidc.views import (
    OIDCAuthenticationRequestView as BaseAuthRequestView,
    OIDCAuthenticationCallbackView as BaseCallbackView,
    get_next_url,
)
from mozilla_django_oidc.utils import import_from_settings


# Cookie name for storing OIDC state
OIDC_STATE_COOKIE = 'oidc_state_cookie'
OIDC_STATE_MAX_AGE = 600  # 10 minutes

logger = logging.getLogger(__name__)


class CookieBasedOIDCAuthenticationRequestView(BaseAuthRequestView):
    """
    Custom authentication request view that stores OIDC state in a signed cookie
    instead of the session. This is more reliable for cross-origin redirects.
    """
    
    def get(self, request):
        """Start the OIDC authentication flow."""
        state = get_random_string(import_from_settings("OIDC_STATE_SIZE", 32))
        nonce = get_random_string(import_from_settings("OIDC_STATE_SIZE", 32))
        
        params = {
            "response_type": "code",
            "scope": import_from_settings("OIDC_RP_SCOPES", "openid profile email"),
            "client_id": import_from_settings("OIDC_RP_CLIENT_ID"),
            "redirect_uri": request.build_absolute_uri(
                reverse("oidc_authentication_callback")
            ),
            "state": state,
            "nonce": nonce,
        }
        
        # Store state data to sign and put in cookie
        state_data = {
            "state": state,
            "nonce": nonce,
            "next": get_next_url(request, "next") or "/",
            "created": time.time(),
        }
        
        # Sign the state data
        signed_state = signing.dumps(state_data, salt='oidc-state')

        # Also store state in the session for resilience.
        # This mirrors mozilla-django-oidc's expectations and provides a
        # fallback if the browser drops the signed cookie.
        try:
            request.session.setdefault("oidc_states", {})
            request.session["oidc_states"][state] = {
                "nonce": nonce,
                "code_verifier": None,
            }
            request.session["oidc_login_next"] = state_data["next"]
            request.session.modified = True
            request.session.save()
        except Exception:
            # Session storage issues should not prevent starting the flow.
            pass
        
        # Build authorization URL
        auth_url = import_from_settings("OIDC_OP_AUTHORIZATION_ENDPOINT")
        redirect_url = f"{auth_url}?{urlencode(params)}"
        
        response = HttpResponseRedirect(redirect_url)
        
        # Set the signed state in a cookie
        response.set_cookie(
            OIDC_STATE_COOKIE,
            signed_state,
            max_age=OIDC_STATE_MAX_AGE,
            httponly=True,
            samesite='Lax',
            secure=False,  # Set to True in production with HTTPS
            path='/',
        )

        # Mayan container is configured to emit mostly ERROR logs.
        # Use ERROR so we can see this in `docker logs` while debugging.
        logger.error(
            "OIDC(authenticate): set %s cookie; host=%s state=%s",
            OIDC_STATE_COOKIE,
            getattr(request, 'get_host', lambda: None)(),
            state,
        )
        
        return response


class CookieBasedOIDCAuthenticationCallbackView(BaseCallbackView):
    """
    Custom callback view that retrieves OIDC state from a signed cookie.
    """
    
    def get(self, request):
        """Handle the OIDC callback."""
        # Get the state from the URL
        url_state = request.GET.get("state")
        code = request.GET.get("code")
        error = request.GET.get("error")

        # Debug what cookies made it back on the callback request.
        try:
            logger.error(
                "OIDC(callback): host=%s state=%s code_present=%s cookie_present=%s session_key=%s",
                getattr(request, 'get_host', lambda: None)(),
                url_state,
                bool(code),
                bool(request.COOKIES.get(OIDC_STATE_COOKIE)),
                getattr(getattr(request, "session", None), "session_key", None),
            )
        except Exception:
            # Never fail auth flow due to logging.
            pass
        
        if error:
            # Mirror upstream behavior: if the OP returned an error, make sure
            # the user doesn't remain logged in and fail the flow.
            try:
                logger.error(
                    "OIDC(callback): OP returned error=%s desc=%s",
                    error,
                    request.GET.get("error_description"),
                )
            except Exception:
                pass

            if getattr(request, "user", None) is not None and request.user.is_authenticated:
                auth.logout(request)
            return self.login_failure()

        if not url_state or not code:
            return self.login_failure()
        
        # Get the signed state from cookie
        signed_state = request.COOKIES.get(OIDC_STATE_COOKIE)
        
        if not signed_state:
            try:
                logger.error(
                    "OIDC(callback): missing %s cookie; falling back to session-based flow",
                    OIDC_STATE_COOKIE,
                )
            except Exception:
                pass

            # Fallback: try session-based state.
            try:
                if "oidc_states" in request.session and url_state in request.session["oidc_states"]:
                    nonce = request.session["oidc_states"][url_state]["nonce"]
                    try:
                        del request.session["oidc_states"][url_state]
                        request.session.modified = True
                        request.session.save()
                    except Exception:
                        pass
                    self.user = auth.authenticate(
                        request=request,
                        nonce=nonce,
                        code_verifier=None,
                    )
                    if self.user and getattr(self.user, "is_active", False):
                        return self.login_success()
            except Exception:
                logger.exception(
                    "OIDC(callback): session-based fallback raised; state=%s session_key=%s",
                    url_state,
                    getattr(getattr(request, "session", None), "session_key", None),
                )

            return self.login_failure()
        
        try:
            # Unsign and verify the state
            state_data = signing.loads(signed_state, salt='oidc-state', max_age=OIDC_STATE_MAX_AGE)
        except signing.BadSignature:
            return self.login_failure()
        
        # Verify state matches
        if state_data.get("state") != url_state:
            return self.login_failure()
        
        # Get nonce for token verification
        nonce = state_data.get("nonce")
        next_url = state_data.get("next", "/")
        
        # Store the post-login redirect target in the session, like upstream.
        try:
            request.session["oidc_login_next"] = next_url
            request.session.modified = True
        except Exception:
            pass

        logger.error(
            "OIDC(callback): authenticating with nonce from cookie; state=%s",
            url_state,
        )

        # Perform authentication directly.
        # This avoids relying on `request.session['oidc_states']` and prevents
        # the frequent `OIDC callback state not found` SuspiciousOperation.
        try:
            self.user = auth.authenticate(
                request=request,
                nonce=nonce,
                code_verifier=None,
            )
        except Exception:
            logger.exception(
                "OIDC(callback): authenticate() raised; state=%s cookie_present=%s session_key=%s",
                url_state,
                bool(request.COOKIES.get(OIDC_STATE_COOKIE)),
                getattr(getattr(request, "session", None), "session_key", None),
            )

            # Important: do not re-raise here.
            # If we raise, Django returns 500 and the AutoOIDC middleware will
            # keep redirecting anonymous users back into OIDC, creating a loop.
            response = self.login_failure()
            if hasattr(response, 'delete_cookie'):
                response.delete_cookie(OIDC_STATE_COOKIE, path='/')
            return response

        try:
            logger.error(
                "OIDC(callback): authenticate() result user_present=%s active=%s",
                bool(self.user),
                bool(getattr(self.user, "is_active", False)) if self.user else False,
            )
        except Exception:
            pass

        if self.user and getattr(self.user, "is_active", False):
            response = self.login_success()
        else:
            response = self.login_failure()
        
        # Clear the state cookie
        if hasattr(response, 'delete_cookie'):
            response.delete_cookie(OIDC_STATE_COOKIE, path='/')
        
        return response
