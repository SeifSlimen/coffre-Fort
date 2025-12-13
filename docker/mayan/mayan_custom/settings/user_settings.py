# Custom Mayan EDMS settings for Keycloak OIDC integration
# This file extends the default Mayan production settings to add SSO support
# Uses mozilla-django-oidc which is already included in Mayan EDMS

# =============================================================================
# CRITICAL: Set OIDC view classes BEFORE importing production settings
# These must be defined before mozilla_django_oidc.urls is loaded
# =============================================================================
OIDC_AUTHENTICATE_CLASS = 'mayan_custom.oidc_views.CookieBasedOIDCAuthenticationRequestView'
OIDC_CALLBACK_CLASS = 'mayan_custom.oidc_views.CookieBasedOIDCAuthenticationCallbackView'

from mayan.settings.production import *  # noqa

import os

# =============================================================================
# DISABLE GPG/DOCUMENT SIGNATURES (Fixes BrokenPipeError with PNG files)
# =============================================================================
# These apps cause BrokenPipeError due to python-gnupg + GPG2 incompatibility.
# We MUST filter them from INSTALLED_APPS after the import since base.py has
# already executed before our settings are loaded.

APPS_TO_DISABLE = {
    'mayan.apps.django_gpg.apps.DjangoGPGApp',
    'mayan.apps.document_signatures.apps.DocumentSignaturesApp', 
    'mayan.apps.signature_captures.apps.SignatureCapturesApp',
    # Also try shorter names in case the format differs
    'mayan.apps.django_gpg',
    'mayan.apps.document_signatures',
    'mayan.apps.signature_captures',
}

# Filter out the disabled apps
INSTALLED_APPS = tuple(
    app for app in INSTALLED_APPS 
    if app not in APPS_TO_DISABLE
)

# Add our custom OIDC app to monkey-patch the OIDC URL patterns.
# Use the AppConfig path so `ready()` is executed on modern Django versions.
INSTALLED_APPS = INSTALLED_APPS + ('mayan_custom.apps.CustomOIDCConfig',)

# =============================================================================
# IMPORTANT: DO NOT OVERRIDE AUTHENTICATION_BACKENDS
# =============================================================================
# Overriding AUTHENTICATION_BACKENDS causes Mayan's internal session serializers
# to break with "maximum_session_length" KeyError.
# 
# Instead, Mayan uses its own OIDC integration. We just configure the endpoints.
# Users can still login via OIDC by navigating to:
#   http://localhost:8000/oidc/authenticate/
# 
# The frontend/backend will sync users to Mayan automatically on login.
# =============================================================================

# =============================================================================
# AUTHENTICATION BACKENDS
# =============================================================================
# Even though Mayan has its own OIDC URLs, our callback completes the login by
# calling `django.contrib.auth.authenticate(request=..., nonce=...)`.
# That requires the mozilla-django-oidc authentication backend to be enabled.
#
# Important: do NOT replace Mayan's backends; append to preserve existing behavior.
_OIDC_BACKEND = 'mayan_custom.oidc_backend.MayanKeycloakOIDCBackend'
if 'AUTHENTICATION_BACKENDS' in globals():
    _backends = tuple(AUTHENTICATION_BACKENDS)
else:
    _backends = ('django.contrib.auth.backends.ModelBackend',)

if _OIDC_BACKEND not in _backends:
    AUTHENTICATION_BACKENDS = _backends + (_OIDC_BACKEND,)
else:
    AUTHENTICATION_BACKENDS = _backends

# =============================================================================
# Keycloak OIDC Configuration for mozilla-django-oidc
# =============================================================================
# Client credentials
OIDC_RP_CLIENT_ID = os.environ.get('OIDC_RP_CLIENT_ID', 'mayan-edms')
OIDC_RP_CLIENT_SECRET = os.environ.get('OIDC_RP_CLIENT_SECRET', 'mayan-edms-secret-key-2024')

# Keycloak server URLs
# Use browser-accessible URLs (localhost:8081) for authorization
# Use internal Docker URLs (keycloak:8080) for backend token requests
OIDC_OP_AUTHORIZATION_ENDPOINT = os.environ.get(
    'OIDC_OP_AUTHORIZATION_ENDPOINT',
    'http://localhost:8081/realms/coffre-fort/protocol/openid-connect/auth'
)
OIDC_OP_TOKEN_ENDPOINT = os.environ.get(
    'OIDC_OP_TOKEN_ENDPOINT',
    'http://keycloak:8080/realms/coffre-fort/protocol/openid-connect/token'
)
OIDC_OP_USER_ENDPOINT = os.environ.get(
    'OIDC_OP_USER_ENDPOINT',
    'http://keycloak:8080/realms/coffre-fort/protocol/openid-connect/userinfo'
)
OIDC_OP_JWKS_ENDPOINT = os.environ.get(
    'OIDC_OP_JWKS_ENDPOINT',
    'http://keycloak:8080/realms/coffre-fort/protocol/openid-connect/certs'
)

# Signing algorithm used by Keycloak
OIDC_RP_SIGN_ALGO = 'RS256'

# Login/Logout URLs
LOGIN_URL = '/oidc/authenticate/'
LOGIN_REDIRECT_URL = '/'
LOGIN_REDIRECT_URL_FAILURE = '/authentication/login/'
LOGOUT_REDIRECT_URL = '/'

# =============================================================================
# SESSION CONFIGURATION - Use database backend for multi-worker Gunicorn
# =============================================================================
# CRITICAL: Must use database sessions to share state across Gunicorn workers
# File-based sessions fail with multiple workers (each worker has different view)
SESSION_ENGINE = 'django.contrib.sessions.backends.db'

# Session cookie settings - critical for OIDC state preservation
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30  # 30 days
SESSION_SAVE_EVERY_REQUEST = True
SESSION_COOKIE_SAMESITE = False  # Disable SameSite to allow cross-origin redirects
SESSION_COOKIE_SECURE = False  # Set True in production with HTTPS
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_NAME = 'sessionid'  # Use default Django name
SESSION_COOKIE_PATH = '/'  # Ensure cookie is sent for all paths

# CSRF settings to match
CSRF_COOKIE_SAMESITE = False  # Disable for OIDC flow
CSRF_COOKIE_SECURE = False
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:8000',
    'http://localhost:8081',
    'http://localhost:3000',
]

# OIDC state settings - try to use session state more reliably
OIDC_STATE_SIZE = 32
OIDC_USE_NONCE = True
OIDC_USE_PKCE = False  # Disable PKCE if causing issues

# Create users automatically from OIDC claims
OIDC_CREATE_USER = True

# Rename username claim from Keycloak
OIDC_USERNAME_CLAIM = 'preferred_username'

# Allow session renewal via OIDC
OIDC_RENEW_ID_TOKEN_EXPIRY_SECONDS = 60 * 15  # 15 minutes

# =============================================================================
# Additional OIDC Settings for True SSO
# =============================================================================
# Store access token in session for API use
OIDC_STORE_ACCESS_TOKEN = True
OIDC_STORE_ID_TOKEN = True

# Verify SSL in production (disable for local dev with self-signed certs)
OIDC_VERIFY_SSL = os.environ.get('OIDC_VERIFY_SSL', 'False').lower() == 'true'

# Scopes to request from Keycloak
OIDC_RP_SCOPES = 'openid profile email'

# Logout endpoint
OIDC_OP_LOGOUT_URL_METHOD = 'mozilla_django_oidc.views.OIDCAuthenticationCallbackView'

# Map Keycloak roles to Django groups/permissions
# Custom claim containing roles from Keycloak
OIDC_GROUPS_CLAIM = 'groups'

# Use email as fallback for username
OIDC_USE_NONCE = True

# =============================================================================
# Default-to-SSO behavior
# =============================================================================
# Redirect anonymous UI navigation to OIDC automatically.
# IMPORTANT: The middleware explicitly excludes /api/* so backend Mayan API calls
# keep working without getting 302 redirects.
_AUTO_OIDC_MIDDLEWARE = 'mayan_custom.middleware.AutoOIDCLoginMiddleware'
if 'MIDDLEWARE' in globals():
    if _AUTO_OIDC_MIDDLEWARE not in MIDDLEWARE:
        _mw = list(MIDDLEWARE)
        # Needs request.session, so it must run AFTER SessionMiddleware.
        try:
            _session_idx = _mw.index('django.contrib.sessions.middleware.SessionMiddleware')
            _mw.insert(_session_idx + 1, _AUTO_OIDC_MIDDLEWARE)
        except ValueError:
            _mw.append(_AUTO_OIDC_MIDDLEWARE)
        MIDDLEWARE = tuple(_mw)
