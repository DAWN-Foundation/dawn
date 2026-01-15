# 802.1X EAP Authentication for Dawn AMF

This module implements 802.1X EAP (Extensible Authentication Protocol) for Dawn's Authentication Method Framework (AMF).

## Overview

IEEE 802.1X is a standard for port-based network access control (PNAC) that provides an authentication mechanism for devices connecting to a LAN or WLAN. It prevents unauthorized access to the network by requiring devices to authenticate before they can access network resources.

Our implementation focuses on EAP-TLS (Transport Layer Security), which is considered the most secure EAP method since it uses mutual certificate-based authentication between the client and the authentication server.

## Key Components

The 802.1X authentication involves three main components:

1. **Supplicant**: The client device seeking network access
2. **Authenticator**: The network device (access point, switch) that controls network access
3. **Authentication Server**: Typically a RADIUS server that validates client credentials

## EAP Methods Supported

Our implementation supports the following EAP methods:

- **EAP-TLS** (0): Certificate-based authentication that provides mutual authentication
- **PEAP-MSCHAPv2** (1): Password-based authentication using Microsoft Challenge Handshake Authentication Protocol v2
- **EAP-TTLS** (2): Tunneled TLS for secure transport of authentication information

## Parameters

The `EAPMethodParams` struct contains the following fields:

- `certificate_authority`: Public key of the certificate authority for server certificate validation
- `cipher_suite`: TLS cipher suite for secure communications
- `eap_type`: Type of EAP method to use
- `radius_server`: Public key of the RADIUS server
- `max_fragment_size`: Maximum size of TLS fragments
- `session_timeout`: Session timeout in seconds
- `identity_privacy`: Whether to use anonymous identity for privacy
- `validate_server_cert`: Whether server certificate validation is required

## Authentication Process

The 802.1X authentication process follows these general steps:

1. **Initialization**: The authenticator detects the supplicant
2. **Initiation**: The supplicant and authenticator exchange identity information
3. **Negotiation**: The authentication server and supplicant agree on an EAP method
4. **Authentication**: The client authenticates with the server
5. **Authorization**: Upon successful authentication, the client is granted network access

## Security Considerations

Our implementation prioritizes security through:

- Support for mutual authentication with EAP-TLS
- Server certificate validation
- Secure cipher suites
- Identity privacy options
- Session timeouts for security policy enforcement

## Usage

To register an 802.1X EAP authentication method for a Dawn network:

1. Create an `EAPMethodParams` instance with appropriate settings
2. Register the authentication method using `registerAuthMethod`
3. Configure client devices to use the appropriate EAP method

See the test file (`tests/dawn/09_amf.ts`) for a complete example of registering an EAP-TLS authentication method.
