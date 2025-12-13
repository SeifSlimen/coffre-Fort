param(
  [string]$Container = "coffre-fort-mayan",
  [string]$Username = "",
  [string]$Password = ""
)

$ErrorActionPreference = "Stop"

function Get-ContainerEnvVar([string]$Name) {
  try {
    return (docker exec $Container sh -lc "printenv $Name" 2>$null).Trim()
  } catch {
    return ""
  }
}

if (-not $Username) {
  $Username = Get-ContainerEnvVar "MAYAN_AUTOADMIN_USERNAME"
}
if (-not $Password) {
  $Password = Get-ContainerEnvVar "MAYAN_AUTOADMIN_PASSWORD"
}

if (-not $Username) { $Username = "admin" }
if (-not $Password) { $Password = "admin123" }

Write-Host "Ensuring Mayan admin password for user '$Username' in container '$Container'..."

$python = @'
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
'@

$shCmd = "export PYTHONPATH=/var/lib/mayan:\$PYTHONPATH; export DJANGO_SETTINGS_MODULE=mayan_custom.settings.user_settings; /opt/mayan-edms/bin/python -"

$python | docker exec -i -e ADMIN_USERNAME=$Username -e ADMIN_PASSWORD=$Password $Container sh -lc $shCmd

if ($LASTEXITCODE -ne 0) {
  throw "Password ensure failed (exit code $LASTEXITCODE)"
}
