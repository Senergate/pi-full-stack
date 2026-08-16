# Joining the WireGuard VPN

This VPN provides access to the remote device network `10.20.0.0/24`.

## 1. Install WireGuard

On Ubuntu/Debian:

```bash
sudo apt update
sudo apt install wireguard
```

## 2. Generate your own key pair

```bash
umask 077
wg genkey | tee ~/wg-vigor-private.key | wg pubkey > ~/wg-vigor-public.key
```

View your **public** key:

```bash
cat ~/wg-vigor-public.key
```

Send this public key to the VPN administrator.

> **Important:** Never share `wg-vigor-private.key`.

## 3. Get your VPN IP

The VPN administrator will assign you a unique VPN address, for example:

```text
10.99.0.4
```

Each workstation must have a different address.

The administrator must add your public key as a peer on `vigor`:

```ini
[Peer]
PublicKey = <YOUR_PUBLIC_KEY>
AllowedIPs = 10.99.0.4/32
```

WireGuard on `vigor` must then be reloaded/restarted.

## 4. Configure WireGuard

In NetworkManager, create a new **WireGuard** connection.

### Interface

```text
Interface name:  wg-vigor
IPv4 address:    10.99.0.4/32
Private key:     contents of ~/wg-vigor-private.key
Listen port:     automatic
MTU:             automatic
Add peer routes: enabled
```

### Peer

```text
Public key:            <VIGOR_PUBLIC_KEY>
Endpoint:              s.jluk.de:3183
Allowed IPs:           10.99.0.0/24, 10.20.0.0/24
Preshared key:         none
Persistent keepalive:  25
```

The VPN administrator can provide `<VIGOR_PUBLIC_KEY>`.

## 5. Connect and test

Enable the `wg-vigor` connection.

Test connectivity to the VPN server:

```bash
ping 10.99.0.1
```

Then test connectivity to a device in the remote box:

```bash
ping 10.20.0.200
```

SSH to devices using their `10.20.0.x` address:

```bash
ssh <user>@10.20.0.200
```

Only traffic for `10.99.0.0/24` and `10.20.0.0/24` is routed through the VPN. Normal Internet traffic continues to use the workstation's normal Internet connection.

