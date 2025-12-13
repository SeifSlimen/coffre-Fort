from __future__ import annotations

from datetime import timedelta

from django.utils.translation import gettext_lazy as _

from mayan.apps.task_manager.classes import CeleryQueue
from mayan.apps.task_manager.workers import worker_c


# Periodic tasks should run on the periodic worker.
queue_mayan_custom_periodic = CeleryQueue(
    name='mayan_custom_periodic',
    label=_(message='Mayan custom periodic'),
    transient=True,
    worker=worker_c,
)


queue_mayan_custom_periodic.add_task_type(
    dotted_path='mayan_custom.tasks.sync_acl_from_redis_task',
    label=_(message='Sync Mayan ACLs from backend Redis grants'),
    name='mayan_custom_sync_acl_from_redis',
    schedule=timedelta(seconds=30),
)
