from __future__ import annotations

from celery import shared_task


@shared_task(bind=True, ignore_result=True)
def sync_acl_from_redis_task(self):
    # Import inside task to ensure Django is fully initialized.
    from mayan_custom.acl_sync import sync_acl_from_redis

    stats = sync_acl_from_redis()
    # Keep logs short but useful.
    print(f"[mayan_custom] ACL sync stats: {stats}")
