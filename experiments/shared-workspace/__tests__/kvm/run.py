import pathlib, subprocess, sys, tempfile, time
root=pathlib.Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(dir=root,prefix="workspace-") as name:
 p=pathlib.Path(name)/"work.ext4"
 with p.open("wb") as f: f.truncate(32*1024*1024)
 subprocess.run(["mkfs.ext4","-q","-F",str(p)],check=True)
 for phase,marker in [("edit","BROWSER_SSH_REVOKE_OK"),("verify","COLD_FILE_OK")]:
  log=root/("workspace-"+phase+".log")
  with log.open("wb") as out:
   vm=subprocess.Popen(["qemu-system-x86_64","-accel","kvm","-cpu","host","-m","1536","-smp","1","-nographic","-monitor","none","-no-reboot","-nic","none","-kernel","boot/vmlinuz-virt","-initrd","boot/initramfs-virt","-cdrom","alpine-virt-3.23.8-x86_64.iso","-drive","file=payload.ext4,if=virtio,format=raw,readonly=on","-drive",f"file={p},if=virtio,format=raw","-drive","file=extra.ext4,if=virtio,format=raw,readonly=on","-append","console=ttyS0 modules=loop,squashfs,sd-mod,usb-storage modloop=/boot/modloop-virt quiet"],cwd=root,stdin=subprocess.PIPE,stdout=out,stderr=subprocess.STDOUT)
   try:
    end=time.monotonic()+22
    while b"localhost login:" not in log.read_bytes():
     if time.monotonic()>end or vm.poll() is not None: raise RuntimeError("serial login not ready")
     time.sleep(.1)
    vm.stdin.write(b"root\n"); vm.stdin.flush(); time.sleep(.4)
    vm.stdin.write(("ip link set lo up; modprobe virtio_blk; mkdir /fixture /workspace /extra; mount -o ro /dev/vda /fixture && mount /dev/vdb /workspace && mount -o ro /dev/vdc /extra && (test "+phase+" != edit || /extra/setup.sh) && timeout 40 env LD_LIBRARY_PATH=/fixture/native/usr/lib /fixture/node/bin/node /extra/browser-ssh.mjs "+phase+"; sync; poweroff\n").encode()); vm.stdin.flush()
    vm.wait(timeout=75)
    if not any(line.strip().endswith(marker.encode()) for line in log.read_bytes().splitlines()): raise RuntimeError("Missing guest assertion marker: " + marker)
    print(marker,flush=True)
   finally:
    if vm.poll() is None: vm.terminate(); vm.wait(timeout=5)
