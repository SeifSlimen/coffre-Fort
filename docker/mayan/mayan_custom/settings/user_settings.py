# Custom Mayan EDMS settings for Keycloak OIDC integration
# This file extends the default Mayan production settings to add SSO support
# Uses mozilla-django-oidc which is already included in Mayan EDMS

from mayan.settings.production import *  # noqa

import os

# DO NOT override AUTHENTICATION_BACKENDS - it breaks Mayan's internal auth serializers
# The mozilla_django_oidc backend is already configured in Mayan's base settings
# We just need to provide the OIDC endpoint configuration

# Keycloak OIDC Configuration for mozilla-django-oidc
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
LOGIN_REDIRECT_URL = '/'
LOGOUT_REDIRECT_URL = '/'

# Create users automatically from OIDC claims
OIDC_CREATE_USER = True

# Rename username claim from Keycloak
OIDC_USERNAME_CLAIM = 'preferred_username'

# Allow session renewal via OIDC
OIDC_RENEW_ID_TOKEN_EXPIRY_SECONDS = 60 * 15  # 15 minutes
