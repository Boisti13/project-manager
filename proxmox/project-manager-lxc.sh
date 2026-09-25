#!/usr/bin/env bash
# Creates a Proxmox LXC with Project Manager fully installed (no Docker).
# Run on the Proxmox VE host as root:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/Boisti13/project-manager/main/proxmox/project-manager-lxc.sh)"
#
# Interactive by default (whiptail: default or advanced settings). For an
# unattended run set UNATTENDED=1 and override any of these as needed:
#
#   CTID            container ID                       (next free ID)
#   CT_HOSTNAME     hostname                           (project-manager)
#   CT_CORES        CPU cores                          (2)
#   CT_RAM          memory in MB (build needs ~1 GB)   (2048)
#   CT_SWAP         swap in MB                         (512)
#   CT_DISK         root disk in GB                    (8)
#   CT_STORAGE      storage for the root disk          (local-lvm, else first rootdir storage)
#   TEMPLATE_STORAGE storage for the CT template       (local, else first vztmpl storage)
#   CT_BRIDGE       network bridge                     (vmbr0)
#   CT_IP           "dhcp" or CIDR, e.g. 192.168.1.50/24 (dhcp)
#   CT_GW           gateway, required with a static IP
#   CT_VLAN         VLAN tag                           (none)
#   CT_PASSWORD     root password                      (none; use `pct enter`)
#   PM_BRANCH       branch to install                  (main)
#   PM_RESTORE_FILE backup (.dump) on this host to load into the new
#                   container, e.g. one downloaded from Settings (none)
set -euo pipefail

APP="Project Manager"
RAW_BASE="https://raw.githubusercontent.com/Boisti13/project-manager"

msg() { echo -e "\e[1;34m[*]\e[0m $*"; }
ok() { echo -e "\e[1;32m[✓]\e[0m $*"; }
die() { echo -e "\e[1;31m[✗]\e[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this as root on the Proxmox VE host."
command -v pct >/dev/null && command -v pveam >/dev/null || die "This must run on a Proxmox VE host (pct/pveam not found)."

first_storage() { # $1 = content type -> active storages, most free space first
  pvesm status -content "$1" 2>/dev/null | awk 'NR>1 && $3=="active" {print $6, $1}' | sort -rn | awk '{print $2}'
}
pick_storage() { # $1 = content type, $2 = preferred
  local all; all="$(first_storage "$1")"
  if grep -qx "$2" <<<"$all"; then echo "$2"; else head -1 <<<"$all"; fi
}

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
CT_HOSTNAME="${CT_HOSTNAME:-project-manager}"
CT_CORES="${CT_CORES:-2}"
CT_RAM="${CT_RAM:-2048}"
CT_SWAP="${CT_SWAP:-512}"
CT_DISK="${CT_DISK:-8}"
CT_STORAGE="${CT_STORAGE:-$(pick_storage rootdir local-lvm)}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-$(pick_storage vztmpl local)}"
CT_BRIDGE="${CT_BRIDGE:-vmbr0}"
CT_IP="${CT_IP:-dhcp}"
CT_GW="${CT_GW:-}"
CT_VLAN="${CT_VLAN:-}"
CT_PASSWORD="${CT_PASSWORD:-}"
PM_BRANCH="${PM_BRANCH:-main}"
PM_RESTORE_FILE="${PM_RESTORE_FILE:-}"

# ---- settings dialog -------------------------------------------------------
if [[ "${UNATTENDED:-0}" != 1 && -t 0 ]] && command -v whiptail >/dev/null; then
  TITLE="$APP LXC"
  ask() { # $1 prompt, $2 default -> echoes answer; Cancel aborts
    whiptail --title "$TITLE" --inputbox "$1" 9 64 "$2" 3>&1 1>&2 2>&3 || die "Cancelled."
  }
  MODE=$(whiptail --title "$TITLE" --menu "Create a new container for $APP" 13 64 2 \
    "default" "CT $CTID, $CT_CORES cores, ${CT_RAM} MB, ${CT_DISK} GB, DHCP" \
    "advanced" "Choose every setting" 3>&1 1>&2 2>&3) || die "Cancelled."
  if [[ "$MODE" == advanced ]]; then
    CTID=$(ask "Container ID" "$CTID")
    CT_HOSTNAME=$(ask "Hostname" "$CT_HOSTNAME")
    CT_CORES=$(ask "CPU cores" "$CT_CORES")
    CT_RAM=$(ask "Memory (MB) — the frontend build needs about 1 GB" "$CT_RAM")
    CT_SWAP=$(ask "Swap (MB)" "$CT_SWAP")
    CT_DISK=$(ask "Root disk size (GB)" "$CT_DISK")
    CT_STORAGE=$(ask "Storage for the root disk ($(first_storage rootdir | paste -sd' '))" "$CT_STORAGE")
    CT_BRIDGE=$(ask "Network bridge" "$CT_BRIDGE")
    CT_IP=$(ask "IPv4: 'dhcp' or CIDR (e.g. 192.168.1.50/24)" "$CT_IP")
    [[ "$CT_IP" != dhcp ]] && CT_GW=$(ask "Gateway" "$CT_GW")
    CT_VLAN=$(ask "VLAN tag (empty for none)" "$CT_VLAN")
    CT_PASSWORD=$(whiptail --title "$TITLE" --passwordbox "Root password (empty: none, use 'pct enter $CTID')" 9 64 3>&1 1>&2 2>&3) || die "Cancelled."
    PM_BRANCH=$(ask "Branch to install" "$PM_BRANCH")
  fi
fi

# ---- validation --------------------------------------------------------------
[[ "$CTID" =~ ^[0-9]+$ ]] || die "Invalid container ID: $CTID"
pct status "$CTID" >/dev/null 2>&1 && die "Container $CTID already exists."
qm status "$CTID" >/dev/null 2>&1 && die "ID $CTID is already used by a VM."
[[ -n "$CT_STORAGE" ]] || die "No storage with 'rootdir' content found."
[[ -n "$TEMPLATE_STORAGE" ]] || die "No storage with 'vztmpl' content found."
[[ "$CT_IP" == dhcp || -n "$CT_GW" ]] || die "A static IP needs a gateway (CT_GW)."
(( CT_RAM >= 1024 )) || die "At least 1024 MB of memory is needed to build the frontend."
[[ -z "$PM_RESTORE_FILE" || -f "$PM_RESTORE_FILE" ]] || die "Backup to restore not found: $PM_RESTORE_FILE"

NET="name=eth0,bridge=$CT_BRIDGE,ip=$CT_IP"
[[ -n "$CT_GW" ]] && NET+=",gw=$CT_GW"
[[ -n "$CT_VLAN" ]] && NET+=",tag=$CT_VLAN"

echo
msg "Container $CTID ($CT_HOSTNAME): $CT_CORES cores, ${CT_RAM} MB RAM, ${CT_DISK} GB on $CT_STORAGE, $CT_BRIDGE/$CT_IP, branch $PM_BRANCH"

# ---- template ------------------------------------------------------------------
msg "Looking up the Debian 12 template"
pveam update >/dev/null 2>&1 || true
TEMPLATE=$(pveam available --section system | awk '/debian-12-standard/ {print $2}' | sort -V | tail -1)
[[ -n "$TEMPLATE" ]] || die "No debian-12-standard template available from pveam."
if ! pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE"; then
  msg "Downloading $TEMPLATE to $TEMPLATE_STORAGE"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" >/dev/null
fi
ok "Template $TEMPLATE"

# ---- create + start --------------------------------------------------------------
msg "Creating container $CTID"
CREATE_ARGS=(
  "$CTID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE"
  --hostname "$CT_HOSTNAME"
  --cores "$CT_CORES" --memory "$CT_RAM" --swap "$CT_SWAP"
  --rootfs "$CT_STORAGE:$CT_DISK"
  --net0 "$NET"
  --unprivileged 1 --features nesting=1
  --onboot 1 --tags project-manager
  --description "$APP — https://github.com/Boisti13/project-manager"
)
[[ -n "$CT_PASSWORD" ]] && CREATE_ARGS+=(--password "$CT_PASSWORD")
pct create "${CREATE_ARGS[@]}" >/dev/null
ok "Container created"

on_fail() {
  echo
  die "Setup failed. Container $CTID was left in place for inspection ('pct enter $CTID'); remove it with: pct stop $CTID; pct destroy $CTID"
}
trap on_fail ERR

pct start "$CTID"
msg "Waiting for network"
for _ in $(seq 1 60); do
  pct exec "$CTID" -- getent hosts github.com >/dev/null 2>&1 && break
  sleep 1
done
pct exec "$CTID" -- getent hosts github.com >/dev/null 2>&1 || die "Container $CTID has no working network/DNS after 60 s."
ok "Network is up"

# ---- install ---------------------------------------------------------------------------
RESTORE_ARG=""
if [[ -n "$PM_RESTORE_FILE" ]]; then
  msg "Copying backup $(basename "$PM_RESTORE_FILE") into the container"
  pct push "$CTID" "$PM_RESTORE_FILE" /root/project-manager-restore.dump --perms 600
  RESTORE_ARG="--restore /root/project-manager-restore.dump"
fi

msg "Installing $APP inside the container (this takes a few minutes)"
pct exec "$CTID" -- bash -c "
  set -e
  export DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 LC_ALL=C.UTF-8
  apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null
  curl -fsSL '$RAW_BASE/$PM_BRANCH/install.sh' -o /root/project-manager-install.sh
  bash /root/project-manager-install.sh --yes --branch '$PM_BRANCH' $RESTORE_ARG
"
trap - ERR

IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')
pct set "$CTID" --description "$APP — http://$IP/
https://github.com/Boisti13/project-manager" >/dev/null
echo
ok "$APP is running in container $CTID"
echo
echo "    http://$IP/"
echo
if [[ -n "$PM_RESTORE_FILE" ]]; then
  echo "Log in with an account from the restored backup."
else
  echo "Register there — the first account becomes the admin."
fi
echo "Updates: Settings -> Updates in the app."
