"""
Custom OIDC app configuration that replaces mozilla-django-oidc views.
"""
from django.apps import AppConfig


class CustomOIDCConfig(AppConfig):
    name = 'mayan_custom'
    label = 'mayan_custom_oidc'
    verbose_name = 'Custom OIDC'
    
    def ready(self):
        """Monkey-patch OIDC URL patterns when app is ready.

        Mayan ships its own OIDC integration that *overrides* the callback view
        at `mayan.apps.authentication_oidc.urls` and explicitly notes that
        `OIDC_CALLBACK_CLASS` is read too early to be effective.

        So we patch both:
        - `mozilla_django_oidc.urls` (authenticate endpoint)
        - `mayan.apps.authentication_oidc.urls` (callback override)
        """

        import mozilla_django_oidc.urls as oidc_urls
        import mayan.apps.authentication_oidc.urls as mayan_oidc_urls
        from mayan_custom.oidc_views import (
            CookieBasedOIDCAuthenticationRequestView,
            CookieBasedOIDCAuthenticationCallbackView,
        )
        
        # Replace the URL patterns in mozilla_django_oidc
        from django.urls import path
        from mozilla_django_oidc import views
        
        oidc_urls.urlpatterns = [
            path("callback/", CookieBasedOIDCAuthenticationCallbackView.as_view(), name="oidc_authentication_callback"),
            path("authenticate/", CookieBasedOIDCAuthenticationRequestView.as_view(), name="oidc_authentication_init"),
            path("logout/", views.OIDCLogoutView.as_view(), name="oidc_logout"),
        ]

        # Patch Mayan's explicit callback override.
        # Keep the same route and name, just swap the view.
        try:
            new_callback = path(
                'oidc/callback/',
                CookieBasedOIDCAuthenticationCallbackView.as_view(),
                name='oidc_authentication_callback'
            )
            replaced = False
            for idx, pattern in enumerate(getattr(mayan_oidc_urls, 'urlpatterns', [])):
                if getattr(pattern, 'name', None) == 'oidc_authentication_callback':
                    mayan_oidc_urls.urlpatterns[idx] = new_callback
                    replaced = True
                    break

            if not replaced:
                # Fallback: append if upstream changes.
                mayan_oidc_urls.urlpatterns = list(getattr(mayan_oidc_urls, 'urlpatterns', [])) + [new_callback]
        except Exception:
            # Never crash app initialization.
            pass

        # Register a small internal API endpoint to allow the backend to
        # trigger an immediate ACL sync (instead of waiting for the periodic task).
        try:
            from django.urls import re_path

            from mayan.urls import urlpatterns as mayan_urlpatterns
            from mayan_custom.api_views import ACLSyncNowView

            already_registered = any(
                getattr(pattern, 'name', None) == 'mayan_custom_acl_sync_now'
                for pattern in mayan_urlpatterns
            )

            if not already_registered:
                mayan_urlpatterns += (
                    re_path(
                        route=r'^api/custom/acl-sync/$',
                        name='mayan_custom_acl_sync_now',
                        view=ACLSyncNowView.as_view(),
                    ),
                )
        except Exception:
            # Never crash app initialization.
            pass
