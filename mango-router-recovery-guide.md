# Mango Router Recovery Guide

Minimal recovery procedure for the GL-MT300N-V2 after a factory reset.

## 1. Configure the Mango LAN

Connect a laptop to the Mango LAN port and open:

``` text
http://192.168.8.1
```

Set the admin password, then under **Network -\> LAN** configure:

``` text
Router IP:    10.20.0.1
Netmask:      255.255.255.0
DHCP:         enabled
DHCP start:   10.20.0.100
DHCP end:     10.20.0.199
```

Apply the changes and reconnect to the Mango. The admin interface is
now:

``` text
http://10.20.0.1
```

The address `10.20.0.200` is deliberately outside the dynamic DHCP pool
so it can be reserved for the device.

## 2. Configure Internet Access

Under **Internet**, configure the available uplink, for example:

-   **Repeater** for Wi-Fi / phone hotspot
-   **WAN Ethernet** for a wired uplink

Verify that the Mango has Internet access.

## 3. Restore the WireGuard Client

On `vigor`, retrieve the Mango's existing private key:

``` bash
cat ~/mango-private.key
```

Keep this key private.

In the Mango admin panel, go to:

**VPN -\> WireGuard Client -\> Add manually -\> Item Mode**

Configure:

``` text
Name:          vigor

Interface
IPv4 Address:  10.99.0.3/32
Private Key:   <MANGO PRIVATE KEY>
Listen Port:   blank
DNS:           blank
MTU:           blank/default

Peer
Public Key:    <VIGOR PUBLIC KEY>
Endpoint:      s.jluk.de:3183
Keepalive:     25
Allowed IPs:   10.99.0.0/24, 192.168.178.0/24
Preshared Key: disabled
```

If needed, get vigor's public key with:

``` bash
sudo cat /etc/wireguard/public.key
```

Save and start the WireGuard connection.

> **Important:** Reuse the existing Mango private key. If a new Mango
> key is generated, its new public key must also be configured for the
> Mango peer on `vigor`.

## 4. Enable Access to the Mango LAN

Enable **Remote Access LAN** for the WireGuard client.

This is required so traffic arriving through WireGuard can be forwarded
to devices on the Mango LAN (`10.20.0.0/24`).

If necessary, verify the forwarding configuration over SSH:

``` bash
ssh root@10.20.0.1
uci show firewall.wgclient2lan
```

The forwarding should be enabled from `wgclient` to `lan`.

## 5. Reserve the Device IP Address

Under **Network -\> LAN -\> Address Reservation**, reserve the required
address using the device's Ethernet MAC address.

For the device at `.200`:

``` text
MAC Address:  <DEVICE ETHERNET MAC>
IP Address:   10.20.0.200
```

Because the dynamic DHCP pool ends at `10.20.0.199`, `.200` is reserved
exclusively for this device.

Reconnect or reboot the device after creating the reservation.

Verify on the device:

``` bash
ip addr show eth0
ip route
```

Expected:

``` text
IP address:       10.20.0.200
Default gateway:  10.20.0.1
```

## 6. Test the VPN from vigor

On `vigor`:

``` bash
sudo wg show
```

The Mango peer should have:

``` text
Allowed IPs:       10.99.0.3/32, 10.20.0.0/24
Latest handshake:  recent
```

Then test:

``` bash
ping -c 4 10.20.0.1
ping -c 4 10.20.0.200
```

Both should succeed.

## 7. Test from a VPN Workstation

Connect the workstation to `wg-vigor`, then test:

``` bash
ping -c 4 10.99.0.1
ping -c 4 10.20.0.200
```

SSH to the device:

``` bash
ssh <user>@10.20.0.200
```

If these work, the Mango is fully restored.

## Network Reference

``` text
WireGuard hub (vigor):       10.99.0.1
Workstation 1:               10.99.0.2
Mango WireGuard interface:   10.99.0.3

Mango LAN:                   10.20.0.0/24
Mango LAN address:           10.20.0.1
Dynamic DHCP pool:           10.20.0.100 - 10.20.0.199
Reserved device:             10.20.0.200

WireGuard endpoint:          s.jluk.de:3183
```
