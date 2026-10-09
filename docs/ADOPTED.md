# Adopted question bank

> The legal and provenance record for every question this repository did not
> author. `validateBank` cross-checks this file against the bank's `upstream`
> fields, so the two cannot drift apart silently.

## Source

| | |
|---|---|
| Project | [`Onesayi/ccna-simulator`](https://github.com/Onesayi/ccna-simulator) |
| Author | Alistair Nhiwatiwa |
| Licence | MIT |
| Commit | `6efca4f15e8ccf01fb44973b46bb26922797965a` |
| Committed | 2026-10-04 |
| Files read | `packages/engine/src/exam/bank/{infrastructure,operations,routing,security,switching}.ts` |
| Questions found | 174 |
| Adopted | 169 |
| Dropped as out of scope | 5 |

Licence text and full upstream history are at the project URL above. The MIT
licence permits reuse provided the copyright notice and licence text travel
with the material; `LICENSE` in this repository carries our own notice and the
per-file `provenance` header names this source.

## Why the re-keying is not mechanical

The upstream questions are labelled against the CCNA **v1.0** blueprint using
top-level objective IDs (`1.3`, `2.4`, `3.3`). This project's bank is keyed to
the **v1.1** blueprint's **leaf** IDs (`1.6`, `3.4.d`, `5.7`).

Two things make a find-and-replace wrong rather than merely inelegant:

1. **IDs were reused for different topics.** Upstream `3.3` is OSPF (14 questions);
   v1.1 `3.3` is static routing. A mechanical remap would file OSPF under static routing.
2. **Domains were reorganised.** Syslog, NTP, SNMP, DHCP configuration and NAT sat in
   Security Fundamentals under v1.0 and moved to IP Services in v1.1, so upstream's
   own domain labels are wrong for v1.1.

Every mapping below was therefore derived from **the question's own text**, not
from its upstream label. The `why` column records the reasoning so a reviewer can
disagree with a specific row rather than with the whole table.

## Distribution after re-keying

| v1.1 domain | Adopted | Pilot quota | In pilot subset |
|---|---|---|---|
| Network Fundamentals (NF) | 33 | 12 | 15 |
| Network Access (NA) | 37 | 12 | 15 |
| IP Connectivity (IPC) | 31 | 15 | 12 |
| IP Services (IPS) | 32 | 6 | 12 |
| Security Fundamentals (SEC) | 24 | 9 | 12 |
| Automation and Programmability (AUTO) | 12 | 6 | 2 |
| **Total** | **169** | **60** | **68** |

The adopted bank is **larger than the pilot milestone**, so closing the pilot is a
selection problem rather than a writing problem: pick 60 questions that satisfy the
12/12/15/6/9/6 quotas and the per-topic floors.

## Dropped as out of scope

| Upstream id | v1.0 label | Reason |
|---|---|---|
| `ipv4-class-b` | 1.0/1.3 | classful A/B/C ranges. No classful objective exists in the v1.1 blueprint (verified: zero matches for classful/Class A/B/C across all 97). |
| `ospfv3-enable` | 3.0/3.3 | OSPFv3 interface enablement. v1.1 single-area OSPF is IPv4-only (3.4 has no v3 children); OSPFv3 is not a configured objective. |
| `scp-needs-ssh` | 4.0/4.2 | SCP/SFTP file transfer. v1.1 IP Services 4.9 covers only TFTP and FTP; there is no SCP/SFTP objective. |
| `copy-running-startup` | 4.0/4.2 | NVRAM startup-config location. No v1.1 objective covers configuration storage; 1.7 (private IPv4 addressing and reserved ranges) is not a real home for it. |
| `storm-control` | 4.0/4.7 | Storm control. v1.1 5.7 covers DHCP snooping, DAI and port security only; 5.2 is the security-program objective, not Layer 2 protection. |

## Pilot topics with no adopted coverage

These have **zero** adopted questions and must be authored. They are content gaps
in the upstream bank, not mapping failures; the nearest upstream questions cover a
related but distinct topic.

| v1.1 topic | Objective | Adopted |
|---|---|---|
| `1.1.a` | Routers forward traffic between networks using a routing table | **0** |
| `3.1.b` | The prefix is the network portion of a routing table entry | **0** |
| `3.1.d` | The next hop is the address traffic is forwarded to | **0** |
| `5.1` | Key security concepts: threats, vulnerabilities, exploits and mitigation techniques | **0** |
| `5.8` | Compare authentication, authorization and accounting concepts | **0** |
| `6.1` | How automation impacts network management | **0** |
| `6.7` | Components of JSON-encoded data | **0** |

## Full mapping

| Upstream id | v1.0 label | v1.1 topic | v1.1 domain | In pilot | Rationale for the mapping |
|---|---|---|---|---|---|
| `aaa-local-fallback` | 4.0/4.1 | `2.8` | NA | no | device management access |
| `aaa-new-model` | 4.0/4.1 | `2.8` | NA | no | device management access |
| `acl-delete-entry` | 4.0/4.6 | `5.6` | SEC | yes | editing ACL entries |
| `acl-extended-http` | 4.0/4.6 | `5.6` | SEC | yes | extended ACL syntax |
| `acl-implicit-deny` | 4.0/4.6 | `5.6` | SEC | yes | ACL implicit deny |
| `acl-numbered-ranges` | 4.0/4.6 | `5.6` | SEC | yes | standard vs extended numbering |
| `acl-per-interface` | 4.0/4.6 | `5.6` | SEC | yes | applying ACLs |
| `acl-standard-match` | 4.0/4.6 | `5.6` | SEC | yes | configure and verify access control lists |
| `acl-standard-placement` | 4.0/4.6 | `5.6` | SEC | yes | ACL placement |
| `acl-wildcard` | 4.0/4.6 | `5.6` | SEC | yes | ACL wildcard masks |
| `ad-values` | 3.0/3.1 | `3.1.e` | IPC | yes | administrative distance expresses preference between sources |
| `agentic-ai` | 5.0/5.1 | `6.4` | AUTO | no | generative and predictive AI and ML in network operations |
| `agentic-ai-oversight` | 5.0/5.1 | `6.4` | AUTO | no | AI in network operations |
| `ansible-agentless` | 5.0/5.5 | `6.6` | AUTO | no | Ansible and Terraform |
| `ansible-inventory` | 5.0/5.5 | `6.6` | AUTO | no | Ansible and Terraform |
| `ap-flexconnect` | 2.0/2.2 | `2.6` | NA | yes | AP modes -> Cisco wireless architectures and AP modes |
| `ap-option43` | 2.0/2.2 | `2.7` | NA | no | AP to controller connectivity -> WLAN component infrastructure |
| `ap-switchport` | 2.0/2.2 | `2.7` | NA | no | switch port for a lightweight AP -> WLAN component infrastructure |
| `apipa` | 1.0/1.7 | `1.7` | NF | yes | 169.254 link-local when DHCP fails -> reserved ranges |
| `bpdu-guard` | 2.0/2.5 | `2.5.d` | NA | no | BPDU guard |
| `cable-copper-distance` | 1.0/1.1 | `1.3.a` | NF | no | copper distance limit -> fibre/multimode/copper trade off distance |
| `cable-crossover` | 1.0/1.1 | `1.3.b` | NF | no | cabling and link types -> Ethernet shared media and point-to-point |
| `cable-fiber` | 1.0/1.1 | `1.3.a` | NF | no | single-mode vs multimode reach -> fibre and copper trade offs |
| `cable-late-collisions` | 1.0/1.1 | `1.4` | NF | no | collisions and duplex mismatch -> identify interface and cable issues |
| `capwap` | 2.0/2.2 | `2.7` | NA | no | physical infrastructure connections of WLAN components |
| `cdp-detail` | 2.0/2.3 | `2.3` | NA | yes | CDP and LLDP |
| `cdp-timers` | 2.0/2.3 | `2.3` | NA | yes | CDP and LLDP |
| `cdp-vs-lldp` | 2.0/2.3 | `2.3` | NA | yes | CDP and LLDP |
| `client-linux-ip` | 1.0/1.6 | `1.10` | NF | no | verify IP parameters for a client OS |
| `connected-local` | 3.0/3.1 | `3.3.b` | IPC | yes | network route points at an entire subnet |
| `dai-binding` | 4.0/4.7 | `5.7` | SEC | no | DHCP snooping and DAI |
| `dai-static-host` | 4.0/4.7 | `5.7` | SEC | no | DHCP snooping and DAI |
| `dhcp-dora` | 1.0/1.7 | `4.6` | IPS | no | DHCP client operation -> configure and verify DHCP client and relay |
| `dhcp-exclude` | 1.0/1.7 | `4.6` | IPS | no | DHCP server exclusion -> configure and verify DHCP client and relay |
| `dhcp-ports` | 1.0/1.7 | `4.6` | IPS | no | DHCP transport -> configure and verify DHCP client and relay |
| `dhcp-relay` | 1.0/1.7 | `4.6` | IPS | no | ip helper-address relay -> configure and verify DHCP client and relay |
| `dhcp-renew-windows` | 1.0/1.6 | `1.10` | NF | no | verify IP parameters for a client OS |
| `dhcp-snooping-option82` | 4.0/4.7 | `5.7` | SEC | no | DHCP snooping and DAI |
| `dhcp-snooping-untrusted` | 4.0/4.7 | `5.7` | SEC | no | DHCP snooping and DAI |
| `dns-aaaa` | 4.0/4.4 | `4.3` | IPS | yes | role of DHCP and DNS within the network |
| `dns-cname` | 4.0/4.4 | `4.3` | IPS | yes | role of DNS |
| `dns-mx` | 4.0/4.4 | `4.3` | IPS | yes | role of DHCP and DNS |
| `dns-ns` | 4.0/4.4 | `4.3` | IPS | yes | role of DNS |
| `dns-ptr` | 4.0/4.4 | `4.3` | IPS | yes | role of DNS |
| `dot1q-tag` | 2.0/2.1 | `2.2.b` | NA | yes | 802.1Q tagging and VLAN ID size |
| `dtp-auto-auto` | 2.0/2.1 | `2.2.a` | NA | yes | dynamic auto never negotiates -> stays access, not a trunk |
| `errdisable-recover` | 4.0/4.7 | `5.7` | SEC | no | port security err-disable recovery |
| `etherchannel-loadbalance` | 2.0/2.1 | `2.4` | NA | no | per-flow hashing on EtherChannel |
| `etherchannel-mismatch` | 2.0/2.1 | `2.4` | NA | no | suspended member -> EtherChannel member settings must match |
| `extended-ping` | 2.0/2.4 | `1.4` | NF | no | interface diagnostics -> identify interface issues |
| `fhrp-virtual-mac` | 3.0/3.4 | `3.5` | IPC | no | FHRP concepts |
| `floating-static` | 3.0/3.2 | `3.3.d` | IPC | yes | floating static stays dormant via a higher AD |
| `ftp-ports` | 4.0/4.2 | `4.9` | IPS | no | TFTP and FTP |
| `glbp-avg` | 3.0/3.4 | `3.5` | IPC | no | FHRP concepts |
| `host-route` | 3.0/3.2 | `3.3.c` | IPC | no | host route points at a single address |
| `hsrp-defaults` | 3.0/3.4 | `3.5` | IPC | no | purpose and functions of first hop redundancy protocols |
| `hsrp-show-standby` | 3.0/3.4 | `3.5` | IPC | no | FHRP concepts |
| `hsrp-track` | 3.0/3.4 | `3.5` | IPC | no | FHRP concepts |
| `interface-admin-down` | 1.0/1.1 | `1.6` | NF | yes | no shutdown on an interface -> configure and verify IPv4 addressing |
| `ipsec-esp-ah` | 4.0/4.5 | `5.5` | SEC | no | IPsec |
| `ipsec-tunnel-mode` | 4.0/4.5 | `5.5` | SEC | no | IPsec remote access and site-to-site VPNs |
| `ipv4-broadcast-26` | 1.0/1.3 | `1.6` | NF | yes | subnet/broadcast arithmetic -> IPv4 addressing and subnetting |
| `ipv4-gateway-outside` | 1.0/1.6 | `1.6` | NF | yes | host addressing and gateway reachability -> IPv4 addressing and subnetting |
| `ipv4-hosts-27` | 1.0/1.3 | `1.6` | NF | yes | subnetting arithmetic -> configure and verify IPv4 addressing and subnetting |
| `ipv4-mask-22` | 1.0/1.3 | `1.6` | NF | yes | prefix to dotted-decimal conversion -> IPv4 addressing and subnetting |
| `ipv4-private` | 1.0/1.3 | `1.7` | NF | yes | RFC 1918 reserved ranges -> private IPv4 addressing and reserved ranges |
| `ipv4-smallest-prefix` | 1.0/1.3 | `1.6` | NF | yes | choosing a prefix for a host count -> IPv4 addressing and subnetting |
| `ipv4-ttl` | 1.0/1.3 | `1.4` | NF | no | packet forwarding and TTL behaviour -> interface and cable issues / forwarding behaviour |
| `ipv6-compress` | 1.0/1.4 | `1.8` | NF | no | IPv6 address notation -> configure and verify IPv6 addressing and prefix |
| `ipv6-eui64` | 1.0/1.4 | `1.9.d` | NF | no | Modified EUI-64 interface identifier |
| `ipv6-link-local` | 1.0/1.4 | `1.9.a` | NF | yes | link-local scope is a v1.1 IPv6 address type |
| `ipv6-multicast-all-nodes` | 1.0/1.4 | `1.9.c` | NF | no | multicast address scope -> v1.1 IPv6 address types |
| `ipv6-ndp` | 1.0/1.4 | `1.9.b` | NF | no | neighbour discovery is a v1.1 IPv6 concept |
| `ipv6-slaac` | 1.0/1.4 | `1.8` | NF | no | IPv6 addressing and prefix learning |
| `ipv6-static-link-local` | 3.0/3.2 | `3.3.b` | IPC | yes | IPv4 and IPv6 static routing |
| `ipv6-ula` | 1.0/1.4 | `1.9.a` | NF | yes | unique-local is a v1.1 IPv6 address type |
| `ipv6-unicast-routing` | 3.0/3.2 | `3.3.b` | IPC | yes | IPv4 and IPv6 static routing |
| `lacp-modes` | 2.0/2.1 | `2.4` | NA | no | Layer 2 EtherChannel using LACP |
| `lldp-default` | 2.0/2.3 | `2.3` | NA | yes | CDP and LLDP |
| `local-user-secret` | 4.0/4.1 | `5.3` | SEC | yes | configure and verify device access control using local passwords |
| `loop-guard` | 2.0/2.5 | `2.5.d` | NA | no | loop guard |
| `lpm-24` | 3.0/3.1 | `3.2.a` | IPC | yes | longest prefix match |
| `lpm-25` | 3.0/3.1 | `3.2.a` | IPC | yes | longest prefix match |
| `lpm-default` | 3.0/3.1 | `3.3.a` | IPC | yes | default route matches anything |
| `mgmt-approaches` | 5.0/5.3 | `6.6` | AUTO | no | configuration management mechanisms such as Ansible |
| `mgmt-cloud` | 5.0/5.3 | `6.2` | AUTO | no | controller-based versus traditional networks |
| `nat-inside-local` | 4.0/4.3 | `4.1` | IPS | yes | inside source NAT using static mappings and pools |
| `nat-interfaces` | 4.0/4.3 | `4.1` | IPS | yes | NAT inside/outside interface marking |
| `nat-pat` | 4.0/4.3 | `4.1` | IPS | yes | NAT overload/pool |
| `nat-pool-exhausted` | 4.0/4.3 | `4.1` | IPS | yes | dynamic NAT pool exhaustion |
| `nat-static-cmd` | 4.0/4.3 | `4.1` | IPS | yes | static NAT mapping |
| `native-vlan-mismatch` | 2.0/2.3 | `2.2.c` | NA | no | native VLAN agreement -> native VLAN crosses untagged |
| `native-vlan-untagged` | 2.0/2.1 | `2.2.c` | NA | no | native VLAN crosses a trunk untagged |
| `ntp-stratum` | 5.0/5.6 | `4.2` | IPS | no | configure and verify NTP in client and server modes |
| `ntp-why` | 5.0/5.6 | `4.2` | IPS | no | configure and verify NTP |
| `ospf-2way-normal` | 3.0/3.3.a | `3.4.c` | IPC | no | DR/BDR election and adjacency states |
| `ospf-adjacency-mismatch` | 3.0/3.3.a | `3.4.a` | IPC | no | adjacency requires matching timers |
| `ospf-dr-election` | 3.0/3.3.c | `3.4.c` | IPC | no | broadcast networks and DR/BDR election |
| `ospf-link-state` | 3.0/3.3 | `3.4.a` | IPC | no | OSPF neighbour adjacencies and LSDB |
| `ospf-multicast` | 3.0/3.3 | `3.4.c` | IPC | no | OSPF on broadcast networks |
| `ospf-network-wildcard` | 3.0/3.3 | `3.4.a` | IPC | no | OSPF interface configuration |
| `ospf-p2p` | 3.0/3.3.b | `3.4.b` | IPC | no | point-to-point is an OSPF network type |
| `ospf-passive` | 3.0/3.3 | `3.4.a` | IPC | no | OSPF interface configuration |
| `ospf-priority-zero` | 3.0/3.3.c | `3.4.c` | IPC | no | DR/BDR election |
| `ospf-reference-bw` | 3.0/3.3 | `3.4.a` | IPC | no | OSPF cost and interfaces |
| `ospf-rid-change` | 3.0/3.3.d | `3.4.d` | IPC | yes | router ID selection |
| `ospf-router-id` | 3.0/3.3.d | `3.4.d` | IPC | yes | router ID selection |
| `ospf-timers` | 3.0/3.3.a | `3.4.a` | IPC | no | hello and dead intervals |
| `packet-dst-mac` | 1.0/1.6 | `1.1.b` | NF | yes | L2 forwards by MAC, L3 by IP; remote destination uses the gateway MAC |
| `password-encryption` | 4.0/4.1 | `5.3` | SEC | yes | local passwords |
| `port-security-defaults` | 4.0/4.7 | `5.7` | SEC | no | Layer 2 security: DHCP snooping, DAI and port security |
| `port-security-dynamic` | 4.0/4.7 | `5.7` | SEC | no | port security |
| `port-security-restrict` | 4.0/4.7 | `5.7` | SEC | no | port security |
| `portfast` | 2.0/2.5 | `2.5.c` | NA | no | PortFast edge port |
| `prompt-data-classification` | 5.0/5.2 | `6.4` | AUTO | no | AI in network operations |
| `prompt-output-format` | 5.0/5.2 | `6.4` | AUTO | no | AI in network operations |
| `prompt-persona` | 5.0/5.2 | `6.4` | AUTO | no | AI in network operations |
| `qos-ef` | 4.0/4.0 | `4.7` | IPS | no | QoS per-hop: classification, marking, queuing |
| `qos-llq` | 4.0/4.0 | `4.7` | IPS | no | QoS queuing |
| `qos-shape-police` | 4.0/4.0 | `4.7` | IPS | no | policing and shaping |
| `qos-trust-boundary` | 4.0/4.0 | `4.7` | IPS | no | QoS classification and marking |
| `ra-guard` | 4.0/4.7 | `5.7` | SEC | no | Layer 2 security features |
| `rest-verbs` | 5.0/5.5 | `6.5` | AUTO | yes | REST-based APIs: verbs and data encoding |
| `restconf-transport` | 5.0/5.3 | `6.5` | AUTO | yes | REST-based APIs |
| `roas-subinterface` | 2.0/2.1 | `2.1.c` | NA | yes | inter-VLAN routing via router-on-a-stick |
| `root-guard` | 2.0/2.5 | `2.5.d` | NA | no | root guard |
| `route-metric-brackets` | 3.0/3.1 | `3.1.f` | IPC | no | metric expresses cost within one protocol |
| `rstp-alternate` | 2.0/2.5 | `2.5.a` | NA | no | alternate port role -> RSTP basics |
| `rstp-states` | 2.0/2.5 | `2.5.b` | NA | no | port states -> RSTP basics |
| `sdn-northbound` | 5.0/5.3 | `6.3.b` | AUTO | no | northbound and southbound APIs |
| `snmp-inform` | 5.0/5.4 | `4.4` | IPS | no | function of SNMP |
| `snmp-mib` | 5.0/5.4 | `4.4` | IPS | no | function of SNMP |
| `snmp-ports` | 5.0/5.4 | `4.4` | IPS | no | function of SNMP in network operations |
| `snmp-v3` | 5.0/5.4 | `4.4` | IPS | no | function of SNMP |
| `spine-leaf` | 1.0/1.2 | `1.2.c` | NF | no | spine-leaf architecture |
| `ssh-only-vty` | 4.0/4.1 | `4.8` | IPS | yes | remote access using SSH |
| `ssh-prereqs` | 4.0/4.1 | `4.8` | IPS | yes | configure network devices for remote access using SSH |
| `static-default` | 3.0/3.2 | `3.3.a` | IPC | yes | default route |
| `static-recursive` | 3.0/3.2 | `3.3.b` | IPC | yes | network route / next-hop resolution |
| `stp-cost-100` | 2.0/2.5 | `2.5.b` | NA | no | port states and forwarding/blocking -> RSTP basics |
| `stp-priority-sysid` | 2.0/2.5 | `2.5.a` | NA | no | port roles -> RSTP basics |
| `stp-root-election` | 2.0/2.5 | `2.5.a` | NA | no | root bridge and root port roles -> basic operation of RSTP |
| `stp-root-primary` | 2.0/2.5 | `2.5.a` | NA | no | root port role -> RSTP basics |
| `svi-ip-routing` | 2.0/2.1 | `2.1.c` | NA | yes | SVIs inter-VLAN connectivity routes between VLANs |
| `switch-default-gateway` | 2.0/2.1 | `2.1.c` | NA | yes | SVI needs a default gateway to answer off-subnet |
| `switch-learns-source` | 2.0/2.4 | `1.13.a` | NF | yes | MAC learning from source address |
| `switch-unknown-unicast` | 2.0/2.4 | `1.13.a` | NF | yes | MAC table misses -> MAC learning and aging |
| `syslog-buffered` | 5.0/5.6 | `4.5` | IPS | no | syslog features |
| `syslog-format` | 5.0/5.6 | `4.5` | IPS | no | syslog facilities and severity |
| `syslog-levels` | 5.0/5.6 | `4.5` | IPS | no | syslog features including facilities and severity levels |
| `syslog-server` | 5.0/5.6 | `4.5` | IPS | no | syslog features |
| `tacacs-vs-radius` | 4.0/4.1 | `2.8` | NA | no | device management access via RADIUS/TACACS+ |
| `tcp-handshake` | 1.0/1.6 | `1.5` | NF | yes | TCP vs UDP reliability and ordering |
| `tftp-facts` | 4.0/4.2 | `4.9` | IPS | no | capabilities and functions of TFTP and FTP |
| `traceroute-mechanism` | 2.0/2.4 | `1.4` | NF | no | reachability diagnosis -> identify interface and cable issues |
| `trunk-allowed` | 2.0/2.1 | `2.2.a` | NA | yes | trunk ports carry multiple VLANs |
| `udp-apps` | 1.0/1.6 | `1.5` | NF | yes | TCP vs UDP across transports |
| `virt-containers` | 1.0/1.2 | `1.12` | NF | no | containers and VMs -> virtualization fundamentals |
| `virt-saas` | 1.0/1.2 | `1.2.f` | NF | no | on-premises vs cloud -> characteristics of network topology architectures |
| `virt-type1` | 1.0/1.2 | `1.12` | NF | no | virtualization fundamentals (server virtualization) |
| `vlan-default` | 2.0/2.2 | `2.1.b` | NA | no | the default VLAN exists out of the box |
| `voice-vlan` | 2.0/2.2 | `2.1.a` | NA | yes | access port carrying data and voice VLANs |
| `vpn-remote-access` | 4.0/4.5 | `5.5` | SEC | no | remote access and site-to-site VPNs |
| `vrrp-standard` | 3.0/3.4 | `3.5` | IPC | no | FHRP concepts |
| `vtp-transparent` | 2.0/2.1 | `2.2.a` | NA | yes | VTP on trunks carrying multiple VLANs |
| `wifi-24-channels` | 1.0/1.5 | `2.6` | NA | yes | Cisco wireless architectures and AP modes; channel planning |
| `wifi-5ghz` | 1.0/1.5 | `2.6` | NA | yes | AP radio behaviour -> wireless architectures |
| `wifi-enterprise` | 1.0/1.5 | `5.9` | SEC | yes | 802.1X/EAP -> wireless security protocols |
| `wifi-wpa3` | 1.0/1.5 | `5.9` | SEC | yes | WPA/WPA2/WPA3 -> wireless security protocols |

## What still has to happen

Adopted questions arrive with **one** upstream explanation. This project's schema
requires a rationale on **every wrong option**, because that is the defence against
a defensible second answer shipping unnoticed. Each placeholder is written
`TODO: explain why this is wrong` and `validateBank` fails the milestone-close gate
while any remain — so the adopted bank can live in the repository now and still be
correctly unmergeable.

Two further gaps are known:

- Upstream supplies **no drag-and-drop** questions and only one multi-select. The pilot
  matrix needs 10 drag-drop and 11 multi-select, so those are authored or converted.
- Upstream questions carry a `labs` field naming a hands-on lab, preserved per item as
  `upstreamLabs`. If the engine adoption goes ahead, that is a ready-made link from
  questions to the labs that satisfy them.

## Standing caveat

The upstream project was six days old when adopted, with three stars and one fork. A
licence is a grant by the author; it is not independent confirmation that every line
was written from scratch. That risk is recorded here rather than argued away, and the
full commit SHA is pinned so the exact state reviewed can always be re-fetched and
diffed.
