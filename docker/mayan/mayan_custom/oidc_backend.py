from mozilla_django_oidc.auth import OIDCAuthenticationBackend

from django.contrib.auth.models import Group


class MayanKeycloakOIDCBackend(OIDCAuthenticationBackend):
    def _sync_user_groups(self, user, claims):
        roles = []
        realm_access = claims.get("realm_access")
        if isinstance(realm_access, dict):
            maybe_roles = realm_access.get("roles")
            if isinstance(maybe_roles, list):
                roles = [str(r) for r in maybe_roles]

        # Default everyone to "Users"; elevate based on realm roles if present.
        is_admin = any(r.lower() in {"admin", "administrator", "realm-admin"} for r in roles)
        group_name = "Administrators" if is_admin else "Users"

        group, _ = Group.objects.get_or_create(name=group_name)
        user.groups.add(group)

        # Give staff access to admin-ish users (does not make them superuser).
        if is_admin and not user.is_staff:
            user.is_staff = True

        user.save()

    def get_userinfo(self, access_token, id_token, payload):
        # Keycloak's /userinfo endpoint can return 401 if the token issuer/base URL
        # doesn't match the URL being called, or if Keycloak policy changes.
        # `mozilla-django-oidc` already validated/extracted `payload` from the ID token.
        # Using it avoids hard-failing the entire login on a userinfo HTTP error.
        if isinstance(payload, dict) and payload:
            return payload

        try:
            return super().get_userinfo(access_token, id_token, payload)
        except Exception:
            # Last resort fallback: proceed with whatever we have.
            return payload or {}

    def verify_claims(self, claims):
        # Keycloak often omits `email` (or users don't have it set).
        # Accept logins as long as we have a stable username-like claim.
        return bool(claims.get("preferred_username") or claims.get("sub"))

    def filter_users_by_claims(self, claims):
        username = claims.get("preferred_username") or claims.get("sub")
        if not username:
            return self.UserModel.objects.none()
        return self.UserModel.objects.filter(username__iexact=username)

    def get_username(self, claims):
        return claims.get("preferred_username") or claims.get("sub") or super().get_username(claims)

    def create_user(self, claims):
        username = self.get_username(claims)
        email = claims.get("email") or ""
        user = self.UserModel.objects.create_user(username=username, email=email)
        self._sync_user_groups(user, claims)
        return user

    def update_user(self, user, claims):
        # Keep the local Mayan user in sync on each login.
        email = claims.get("email") or ""
        if email and user.email != email:
            user.email = email

        self._sync_user_groups(user, claims)
        return user
