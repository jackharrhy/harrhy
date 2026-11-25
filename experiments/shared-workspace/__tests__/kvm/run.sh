#!/usr/bin/env bash
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$here/../.."
bsdtar=${HARRHY_SHARED_WORKSPACE_BSDTAR:-bsdtar}
for tool in qemu-system-x86_64 python3 mkfs.ext4 "$bsdtar" curl sha256sum tar xz; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done
[[ $(uname -s) == Linux && $(uname -m) == x86_64 && -r /dev/kvm && -w /dev/kvm ]] || {
  echo "Requires Linux x86_64 and existing read/write access to /dev/kvm" >&2; exit 1;
}
[[ -f node_modules/playwright-core/package.json ]] || { echo "Run pnpm install first" >&2; exit 1; }
umask 077
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
mkdir -p "$scratch/extra/apkfiles" "$scratch/runtime/node" "$scratch/runtime/native"
fetch() {
  local output=$1 digest=$2; shift 2
  for url; do
    if curl -fsSL --retry 1 --max-time 120 "$url" -o "$output"; then
      printf '%s  %s\n' "$digest" "$output" | sha256sum --check --status && return
    fi
  done
  echo "Missing or changed pinned artifact: $(basename "$output")" >&2; exit 1
}
iso=alpine-virt-3.23.8-x86_64.iso
node=node-v26.13.1-linux-x64-musl.tar.xz
mirror=https://dl-cdn.alpinelinux.org/alpine/v3.23
fetch "$scratch/$iso" 5e0879304cfbc433bcafd007f5ef88f6c717020bf739a7636b5d5598fd1b4671 "$mirror/releases/x86_64/$iso"
fetch "$scratch/$node" c2ade3fc8a670f0b110eb68c020026daf1ac57b4fceed1ca471106fc144d8720 "https://nodejs.org/dist/v26.13.1/$node"
while read -r digest file; do
  if [[ -n ${HARRHY_SHARED_WORKSPACE_APKS:-} ]]; then
    cp -- "$HARRHY_SHARED_WORKSPACE_APKS/$file" "$scratch/extra/apkfiles/$file"
    printf '%s  %s\n' "$digest" "$scratch/extra/apkfiles/$file" | sha256sum -c --status
  else
    fetch "$scratch/extra/apkfiles/$file" "$digest" "$mirror/main/x86_64/$file" "$mirror/community/x86_64/$file"
  fi
done < "$here/apks.sha256"
for pkg in libgcc libstdc++ libatomic; do
  "$bsdtar" -xf "$scratch/extra/apkfiles/$pkg-"*.apk -C "$scratch/runtime/native"
done
"$bsdtar" -xf "$scratch/$iso" -C "$scratch" boot/vmlinuz-virt boot/initramfs-virt
tar -xJf "$scratch/$node" --strip-components=1 -C "$scratch/runtime/node" "${node%.tar.xz}/bin/node"
cp -- "$here/"{browser-ssh.mjs,setup.sh,session.sh} "$scratch/extra/"
mkdir "$scratch/extra/node_modules"
cp -aL node_modules/playwright-core "$scratch/extra/node_modules/"
truncate -s 320M "$scratch/payload.ext4"
truncate -s 460M "$scratch/extra.ext4"
mkfs.ext4 -q -F -d "$scratch/runtime" "$scratch/payload.ext4"
mkfs.ext4 -q -F -d "$scratch/extra" "$scratch/extra.ext4"
python3 "$here/run.py" "$scratch"
