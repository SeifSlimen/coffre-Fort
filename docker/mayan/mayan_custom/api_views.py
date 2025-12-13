"""Lightweight admin-only endpoints for the Mayan custom overlay.

These endpoints are meant for internal service-to-service calls (from the backend)
and intentionally avoid introducing additional dependencies (e.g. DRF wiring).
"""

import base64

from django.contrib.auth import authenticate
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from mayan_custom.acl_sync import sync_acl_from_redis


def _basic_auth_user(request):
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Basic '):
        return None

    encoded = auth_header.split(' ', 1)[1].strip()
    try:
        decoded = base64.b64decode(encoded).decode('utf-8')
        username, password = decoded.split(':', 1)
    except Exception:
        return None

    return authenticate(request=request, username=username, password=password)


@method_decorator(csrf_exempt, name='dispatch')
class ACLSyncNowView(View):
    http_method_names = ['post']

    def post(self, request, *args, **kwargs):
        user = _basic_auth_user(request=request)

        if not user:
            return JsonResponse({'detail': 'Unauthorized'}, status=401)

        # Staff/superusers only; this endpoint can grant/revoke document visibility.
        if not (getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False)):
            return JsonResponse({'detail': 'Forbidden'}, status=403)

        stats = sync_acl_from_redis()
        return JsonResponse({'ok': True, 'stats': stats})
