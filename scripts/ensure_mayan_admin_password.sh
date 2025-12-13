#!/usr/bin/env bash
set -euo pipefail

CONTAINER=${1:-coffre-fort-mayan}
USERNAME=${2:-}
PASSWORD=${3:-}

if [[ -z "$USERNAME" ]]; then
  USERNAME=$(docker exec "$CONTAINER" sh -lc 'printenv MAYAN_AUTOADMIN_USERNAME' 2>/dev/null | tr -d '\r' || true)
fi
if [[ -z "$PASSWORD" ]]; then
  PASSWORD=$(docker exec "$CONTAINER" sh -lc 'printenv MAYAN_AUTOADMIN_PASSWORD' 2>/dev/null | tr -d '\r' || true)
fi

USERNAME=${USERNAME:-admin}
PASSWORD=${PASSWORD:-admin123}

echo "Ensuring Mayan admin password for '$USERNAME' in container '$CONTAINER'..."

docker exec -i \
  -e ADMIN_USERNAME="$USERNAME" \
  -e ADMIN_PASSWORD="$PASSWORD" \
  "$CONTAINER" sh -lc \
  'export PYTHONPATH=/var/lib/mayan:$PYTHONPATH; export DJANGO_SETTINGS_MODULE=mayan_custom.settings.user_settings; /opt/mayan-edms/bin/python -' <<'PY'
import os
import django
from django.contrib.auth import get_user_model

username = os.environ.get("ADMIN_USERNAME")
password = os.environ.get("ADMIN_PASSWORD")

if not username or not password:
    raise SystemExit("Missing ADMIN_USERNAME or ADMIN_PASSWORD")

django.setup()

User = get_user_model()
user = User.objects.filter(username=username).first()
if not user:
    raise SystemExit(f"User not found: {username}")

user.set_password(password)
user.is_staff = True
user.is_superuser = True
user.is_active = True
user.save()
print(f"OK: ensured password for '{username}'")
PY
