# Custom Mayan EDMS settings to fix GPG BrokenPipeError
# GPG/signatures disabled entirely for stability

from mayan.settings.production import *

# Disable GPG-related apps to prevent BrokenPipeError with image processing
INSTALLED_APPS = list(INSTALLED_APPS)

apps_to_remove = [
    'django_gpg',
    'mayan.apps.document_signatures',
]

for app in apps_to_remove:
    if app in INSTALLED_APPS:
        INSTALLED_APPS.remove(app)

INSTALLED_APPS = tuple(INSTALLED_APPS)
