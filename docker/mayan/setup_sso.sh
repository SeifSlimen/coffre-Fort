#!/bin/bash
# Pre-command script for Mayan EDMS to set up Keycloak SSO

echo "=== Setting up Keycloak SSO for Mayan EDMS ==="

# Install social-auth packages
pip install --quiet social-auth-app-django social-auth-core

# Copy user settings to the correct location
SETTINGS_SRC="/docker/mayan/user_settings.py"
SETTINGS_DST="/opt/mayan-edms/lib/python3.11/site-packages/mayan/settings/user_settings.py"

if [ -f "$SETTINGS_SRC" ]; then
    cp "$SETTINGS_SRC" "$SETTINGS_DST"
    echo "User settings copied to $SETTINGS_DST"
else
    echo "WARNING: $SETTINGS_SRC not found"
fi

echo "=== Keycloak SSO setup complete ==="
