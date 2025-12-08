# Custom Mayan EDMS settings for Keycloak OIDC integration
# This file extends the default Mayan settings to add SSO support

from mayan.settings.production import *  # noqa

import os

# Add social auth to installed apps
INSTALLED_APPS = list(INSTALLED_APPS) + [
    'social_django',
]

# Configure authentication backends
# Keep the default Mayan backend and add Keycloak OIDC
AUTHENTICATION_BACKENDS = (
    'social_core.backends.keycloak.KeycloakOAuth2',
    'mayan.apps.authentication.authentication_backends.AuthenticationBackendModelEmailPassword',
    'django.contrib.auth.backends.ModelBackend',
)

# Keycloak OIDC Configuration
SOCIAL_AUTH_KEYCLOAK_KEY = os.environ.get('SOCIAL_AUTH_KEYCLOAK_KEY', 'mayan-edms')
SOCIAL_AUTH_KEYCLOAK_SECRET = os.environ.get('SOCIAL_AUTH_KEYCLOAK_SECRET', 'mayan-edms-secret-key-2024')
SOCIAL_AUTH_KEYCLOAK_PUBLIC_KEY = os.environ.get('SOCIAL_AUTH_KEYCLOAK_PUBLIC_KEY', '')

# Keycloak server URLs
# Authorization URL must be browser-accessible (localhost:8081)
# Token URL can use internal Docker network (keycloak:8080)
SOCIAL_AUTH_KEYCLOAK_AUTHORIZATION_URL = os.environ.get(
    'SOCIAL_AUTH_KEYCLOAK_AUTHORIZATION_URL',
    'http://localhost:8081/realms/coffre-fort/protocol/openid-connect/auth'
)
SOCIAL_AUTH_KEYCLOAK_ACCESS_TOKEN_URL = os.environ.get(
    'SOCIAL_AUTH_KEYCLOAK_ACCESS_TOKEN_URL',
    'http://keycloak:8080/realms/coffre-fort/protocol/openid-connect/token'
)

# Social auth pipeline
SOCIAL_AUTH_PIPELINE = (
    'social_core.pipeline.social_auth.social_details',
    'social_core.pipeline.social_auth.social_uid',
    'social_core.pipeline.social_auth.auth_allowed',
    'social_core.pipeline.social_auth.social_user',
    'social_core.pipeline.user.get_username',
    'social_core.pipeline.user.create_user',
    'social_core.pipeline.social_auth.associate_user',
    'social_core.pipeline.social_auth.load_extra_data',
    'social_core.pipeline.user.user_details',
)

# Login/Logout URLs
SOCIAL_AUTH_LOGIN_REDIRECT_URL = '/'
SOCIAL_AUTH_LOGIN_ERROR_URL = '/authentication/login/'

# User field mapping from Keycloak claims
SOCIAL_AUTH_KEYCLOAK_ID_KEY = 'sub'
SOCIAL_AUTH_USERNAME_IS_FULL_EMAIL = True

# Additional social auth settings
SOCIAL_AUTH_JSONFIELD_ENABLED = True

# URL namespace for social auth
SOCIAL_AUTH_URL_NAMESPACE = 'social'
