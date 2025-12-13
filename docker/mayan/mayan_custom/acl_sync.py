from __future__ import annotations

import json
import os
from dataclasses import dataclass

import redis
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.contenttypes.models import ContentType


@dataclass(frozen=True)
class Grant:
    user_id: str
    document_id: int
    permissions: tuple[str, ...]


def _get_redis_client() -> redis.Redis:
    # Backend uses Redis DB 0 by default. Mayan also has a redis service.
    url = (
        os.environ.get("COFFRE_FORT_REDIS_URL")
        or os.environ.get("REDIS_URL")
        or os.environ.get("MAYAN_CELERY_BROKER_URL")
        or os.environ.get("CELERY_BROKER_URL")
        or "redis://redis:6379/0"
    )
    if not url.startswith("redis://") and not url.startswith("rediss://"):
        url = "redis://redis:6379/0"
    return redis.Redis.from_url(url, decode_responses=True)


def _iter_grants(r: redis.Redis):
    # Keys are written by backend/services/accessControl.js
    for key in r.scan_iter(match="grant:*", count=1000):
        try:
            raw = r.get(key)
            if not raw:
                continue
            payload = json.loads(raw)
            user_id = str(payload.get("userId") or "").strip()
            document_id = int(payload.get("documentId"))
            perms = payload.get("permissions") or ["view"]
            if isinstance(perms, str):
                perms = [perms]
            perms = tuple(str(p) for p in perms if p)
            if not user_id:
                continue
            yield Grant(user_id=user_id, document_id=document_id, permissions=perms)
        except Exception:
            continue


def _permission_keys_for_grant(grant: Grant) -> set[str]:
    # Minimum required for the document to appear in Mayan UI.
    keys: set[str] = {"documents.document_view", "documents.document_file_view"}

    if "download" in grant.permissions:
        keys.add("document_downloads.document_file_download")

    if "ocr" in grant.permissions:
        # View extracted content.
        keys.add("document_parsing.content_view")

    # Ignore app-only permissions like ai_summary/upload.
    return keys


def _get_stored_permissions(permission_keys: set[str]):
    from mayan.apps.permissions.models import StoredPermission

    perms = []
    for key in sorted(permission_keys):
        try:
            namespace, name = key.split(".", 1)
            perms.append(StoredPermission.objects.get(namespace=namespace, name=name))
        except Exception:
            # Skip unknown permissions (Mayan version differences).
            continue
    return perms


def _ensure_user_group_role(user_id: str, mayan_user_id: int):
    # Create a dedicated group + role per Keycloak user.
    # This allows per-document ACLs while keeping changes scoped.
    from mayan.apps.permissions.models import Role

    label = f"kc:{user_id}"[:128]
    group, _ = Group.objects.get_or_create(name=label)
    role, _ = Role.objects.get_or_create(label=label)
    role.groups.add(group)

    User = get_user_model()
    user = User.objects.get(pk=mayan_user_id)
    user.groups.add(group)
    return role


def sync_acl_from_redis() -> dict[str, int]:
    """Mirror backend Redis grants into Mayan's ACL table.

    - Reads backend grants: grant:{userId}:{documentId}
    - Uses backend mapping: mayan:user:{userId} -> Mayan user ID
    - Creates per-user Role+Group (kc:{userId})
    - Adds/removes AccessControlList entries per document
    """

    from mayan.apps.acls.models import AccessControlList

    r = _get_redis_client()

    # Map: userId -> list(grants)
    grants_by_user: dict[str, list[Grant]] = {}
    for grant in _iter_grants(r):
        grants_by_user.setdefault(grant.user_id, []).append(grant)

    # Only manage ACLs for Document objects.
    document_ct = ContentType.objects.get(app_label="documents", model="document")

    created = 0
    updated = 0
    deleted = 0
    skipped = 0

    from mayan.apps.permissions.models import Role

    # 1) Remove stale ACLs even when a user's last grant expired/revoked.
    # We manage only our own roles (prefix kc:).
    managed_roles = Role.objects.filter(label__startswith='kc:')
    for role in managed_roles:
        role_user_id = (role.label or '')[3:]
        desired_doc_ids = {g.document_id for g in grants_by_user.get(role_user_id, [])}

        existing_qs = AccessControlList.objects.filter(content_type=document_ct, role=role)
        if desired_doc_ids:
            stale_qs = existing_qs.exclude(object_id__in=desired_doc_ids)
        else:
            stale_qs = existing_qs

        for acl in stale_qs:
            acl.delete()
            deleted += 1

    # 2) Upsert ACLs for all current grants.
    for user_id, user_grants in grants_by_user.items():
        mayan_user_id_raw = r.get(f"mayan:user:{user_id}")
        if not mayan_user_id_raw:
            skipped += len(user_grants)
            continue

        try:
            mayan_user_id = int(mayan_user_id_raw)
        except Exception:
            skipped += len(user_grants)
            continue

        role = _ensure_user_group_role(user_id=user_id, mayan_user_id=mayan_user_id)

        for grant in user_grants:
            permission_keys = _permission_keys_for_grant(grant)
            stored_perms = _get_stored_permissions(permission_keys)

            acl, was_created = AccessControlList.objects.get_or_create(
                content_type=document_ct,
                object_id=grant.document_id,
                role=role,
            )
            acl.permissions.set(stored_perms)
            if was_created:
                created += 1
            else:
                updated += 1

            # Also ensure the Role has the same permissions globally (required by Mayan)
            # This is safe because the role is per-user.
            if stored_perms:
                role.permissions.add(*stored_perms)

    return {
        "created": created,
        "updated": updated,
        "deleted": deleted,
        "skipped": skipped,
    }
