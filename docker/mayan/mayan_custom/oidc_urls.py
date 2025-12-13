"""
Custom URL configuration for OIDC with cookie-based state storage.
"""
from django.urls import path
from .oidc_views import (
    CookieBasedOIDCAuthenticationRequestView,
    CookieBasedOIDCAuthenticationCallbackView,
)

urlpatterns = [
    path(
        "authenticate/",
        CookieBasedOIDCAuthenticationRequestView.as_view(),
        name="oidc_authentication_init",
    ),
    path(
        "callback/",
        CookieBasedOIDCAuthenticationCallbackView.as_view(),
        name="oidc_authentication_callback",
    ),
]
