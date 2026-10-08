# Emulator gaps

<!-- GENERATED FILE - do not edit. Source: src/data/not-emulated.json -->
<!-- Regenerate: npm run docs:generate -->

The emulator is a bounded state machine sized to the shipped hands-on task set, not an IOS clone. Anything absent is declared here rather than silently unavailable, so no question can ever assume behaviour that does not exist.

**Why build rather than adopt:** Real Cisco IOS cannot run in a browser. containerlab, CML and GNS3 require Docker, which defeats a local-first browser tool. Build is correct for the bounded subset.

## Gaps by feature

| Feature | Objective | Assessed via | Partial |
|---|---|---|---|
| DHCP snooping | 5.7 | `show-output` | yes |
| Dynamic ARP inspection | 5.7 | `show-output` | yes |
| TFTP and FTP file transfer | 4.9 | `show-output` | no |
| Syslog transport and facilities | 4.5 | `show-output` | yes |
| SNMP agents and MIB operations | 4.4 | `show-output` | no |
| QoS per-hop behaviour | 4.7 | `show-output` | no |
| Dedicated verification output for EtherChannel | 2.4 | `show-running-config` | yes |
| Dedicated verification output for spanning tree | 2.5 | `show-running-config` | yes |
| Dedicated verification output for DHCP client and relay | 4.6 | `show-running-config` | yes |
| Dedicated verification output for access control lists | 5.6 | `show-running-config` | yes |
| Dedicated verification output for port security | 5.7 | `show-running-config` | yes |
| Wireless RF behaviour | 2.6 | `show-output` | no |

## Rendered show commands

- `show running-config`
- `show ip interface brief`
- `show ip route`
- `show vlan brief`

These exist for student feedback only. Grading reads device state directly through the `expectedState` DSL, so no grading path parses show output.

## WLC scope

Navigation: Cisco AireOS Configuration Guide: WLANs -> New, with General, Security, QoS and Advanced as tabs inside the WLAN editor. Security is a child of a WLAN, not its parent.

**Interface note:** Every question stem must name the interface, AireOS or Catalyst 9800-CL, because the two differ.

In scope:
- profile name
- SSID
- status
- VLAN ID
- WPA2 Personal with PSK
- QoS class
- 802.11ax and DTIM advanced settings

Out of scope:
- RF and channel planning
- transmit power
- roaming
- client tracking
