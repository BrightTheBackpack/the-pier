#!/bin/bash

if [[ -z "$CODESPACES" ]]; then
  echo "Not in a Codespace, not running setup"
  exit 1
fi

echo "Setting up Codespace..."
    
DOMAIN="${CODESPACE_NAME}-80.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"

# if .env doesn't exist, copy from .env.template
if [[ ! -f .env ]]; then
  echo "Creating .env file from from .env.template and domain ${DOMAIN}..."

  cp .env.template .env
  sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
else
  echo ".env file already exists"
fi


