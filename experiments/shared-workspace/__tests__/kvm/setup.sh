#!/bin/sh
set -eu
mount -o remount,size=1100m /; apk add --force-non-repository --no-network --no-progress /extra/apkfiles/*.apk >/tmp/apk.log 2>&1 || { grep -inE "error|failed" /tmp/apk.log; tail /tmp/apk.log; exit 1; }
mkdir -p /run/sshd /tmp/sshlab /workspace/checkout
chmod 777 /workspace/checkout
cp /extra/session.sh /tmp/sshlab/session
chmod 755 /tmp/sshlab/session
cd /tmp/sshlab
ssh-keygen -q -t ed25519 -N "" -f host
for user in owner marty; do
 adduser -D -s /bin/sh "$user"
 passwd -d "$user" >/dev/null
 ssh-keygen -q -t ed25519 -N "" -f "$user"
 mkdir -p "/home/$user/.ssh"
 cp "$user.pub" "/home/$user/.ssh/authorized_keys"
 chown -R "$user:$user" "/home/$user/.ssh"
done
printf "[127.0.0.1]:18622 %s\n" "$(cat host.pub)" >known
cat >sshd_config <<CONFIG
Port 18622
ListenAddress 127.0.0.1
HostKey /tmp/sshlab/host
PidFile /tmp/sshlab/sshd.pid
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PermitRootLogin no
AllowUsers owner marty
DisableForwarding yes
PermitTTY no
ForceCommand /tmp/sshlab/session
CONFIG
/usr/sbin/sshd -f /tmp/sshlab/sshd_config
