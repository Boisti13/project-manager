#!/usr/bin/env bash
# Attaches the Windows and Linux app files of a desktop-v* release to a server
# release under fixed names (ProjectManager-Windows-x64-setup.exe, …), and
# adds the download table (desktop/download-notes.md) to its notes. So the
# release GitHub shows as "Latest" always has the apps, and
# https://github.com/<repo>/releases/latest/download/<name> always gets the
# newest one. Runs from .github/workflows/release-apps.yml (new server
# release) and desktop.yml (new app release -> the latest server release).
#
# Usage: scripts/attach-apps.sh <server tag, e.g. v1.43.3> [<desktop tag>]
#        (default: the newest desktop-v* release). Needs gh and GH_TOKEN.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
export GH_REPO="${GH_REPO:-${GITHUB_REPOSITORY:-Boisti13/project-manager}}"
server_tag=$1
desktop_tag=${2:-$(gh release list --limit 100 --json tagName \
  --jq '[.[] | select(.tagName | startswith("desktop-v"))][0].tagName')}
echo "Attaching the apps of $desktop_tag to $server_tag"

dir=$(mktemp -d)
cd "$dir"
gh release download "$desktop_tag"
mv -- *_x64-setup.exe ProjectManager-Windows-x64-setup.exe
mv -- *_amd64.AppImage ProjectManager-Linux-x86_64.AppImage
mv -- *_aarch64.AppImage ProjectManager-Linux-arm64.AppImage
mv -- *_amd64.deb ProjectManager-Linux-x86_64.deb
mv -- *_arm64.deb ProjectManager-Linux-arm64.deb
gh release upload "$server_tag" ProjectManager-* --clobber

# Notes: the server's changes, then the download table (replacing an older one).
notes=$(gh release view "$server_tag" --json body --jq .body | tr -d '\r' | awk '/^### Download the app/{exit} {print}')
table=$(sed "s/DESKTOP_VERSION/${desktop_tag#desktop-v}/" "$root/desktop/download-notes.md")
printf '%s\n\n%s\n' "$notes" "$table" > notes.md
gh release edit "$server_tag" --notes-file notes.md > /dev/null
echo "Done"
