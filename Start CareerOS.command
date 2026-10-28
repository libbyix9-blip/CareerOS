#!/bin/zsh
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
cd -- "$(dirname -- "$0")" || exit 1
node --env-file-if-exists=.env scripts/desktop.mjs --background
if [[ $? -ne 0 ]]; then
  echo "CareerOS could not start. Keep this window open and share the error above."
  read -r "?Press Return to close."
fi
