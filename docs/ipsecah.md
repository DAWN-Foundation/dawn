# IPsec Authentication Header (AH) for Dawn AMF

This module implements IPsec Authentication Header (AH) for Dawn's Authentication Method Framework (AMF).

## Overview

IPsec AH is a protocol that provides data origin authentication, data integrity, and anti-replay protection at the IP layer (Layer 3). Unlike other IPsec protocols like ESP, AH does not provide confidentiality (encryption) of the payload.

Our implementation focuses on modern hash algorithms like HMAC-SHA256 and supports both transport and tunnel modes.

## Key Components

The IPsec AH implementation involves several components:

1. **Host A**: The initiator of the secure connection
2. **Host B**: The responder to the connection request
3. **IKE (Internet Key Exchange)**: Protocol for establishing Security Associations (SAs)
4. **Security Association (SA)**: Collection of security parameters for a secure connection

## Supported Algorithms

Our implementation supports the following authentication algorithms:

- **HMAC_SHA256_128** (2): Modern, secure hash algorithm (recommended)
- **HMAC_SHA384_192** (3): Higher security hash algorithm
- **HMAC_SHA512_256** (4): Maximum security hash algorithm
- **AES_XCBC_96** (5): Alternative for constrained environments
- **BLAKE2s_128** (8): High-performance modern algorithm

Legacy algorithms (HMAC_MD5_96, HMAC_SHA1_96) are supported but not recommended for new deployments.

## Parameters

The `IPsecAHParams` structure contains the following fields:

- `algorithm`: Authentication algorithm to use
- `keyLifetime`: Key lifetime in seconds
- `mode`: Transport or Tunnel mode
- `spi`: Security Parameter Index
- `replayWindowSize`: Anti-replay window size
- `useExtendedSequence`: Whether to use 64-bit extended sequence numbers
- `ikeParams`: IKEv2 parameters for key exchange

## Authentication Process

IPsec AH establishes secure communications through a two-phase process:

## IPsec AH Flow

```mermaid
sequenceDiagram
    participant A as Host A
    participant B as Host B
    
    Note over A,B: Phase 1: IKE (Internet Key Exchange)
    A->>B: IKE_SA_INIT (Proposal, Key Exchange)
    B->>A: IKE_SA_INIT (Selected Proposal, Key Exchange)
    A->>B: IKE_AUTH (ID, Auth, SA Proposal)
    B->>A: IKE_AUTH (ID, Auth, SA Response)
    Note over A,B: Secure IKE SA established
    
    Note over A,B: Phase 2: IPsec SA Establishment
    A->>B: CREATE_CHILD_SA (AH SA Proposal)
    B->>A: CREATE_CHILD_SA (AH SA Response)
    Note over A,B: IPsec AH SA established

    Note over A,B: Secure Communication
    A->>B: IP Packet with AH Header
    Note right of A: AH includes: SPI, Seq#, Authentication Data
    B->>A: IP Packet with AH Header
    Note left of B: Verify integrity with shared key
```

## Complete Authentication Flow with Dawn AMF

The following diagram shows the complete flow including on-chain transactions and off-chain components:

```mermaid
sequenceDiagram
    participant Authority
    participant HostA as Host A
    participant HostB as Host B
    participant Dawn as Dawn Program (On-Chain)
    participant IKE as IKE Service
    
    Note over Authority,Dawn: Setup Phase (One-Time)
    Authority->>Dawn: registerAuthMethod(IPsecAHParams)
    Dawn-->>Authority: AuthMethod PDA
    Note over Authority: Store AuthMethod address
    
    Note over Authority,Dawn: Connection Registration (Direct with credentials)
    Authority->>Dawn: registerConnection(HostA, HostB, CredentialDataA, CredentialDataB)
    Dawn-->>Authority: Connection PDA
    Authority->>HostA: Connection details & credentials (off-chain)
    Authority->>HostB: Connection details & credentials (off-chain)
    
    Note over HostA,HostB: Real-Time Authentication
    HostA->>IKE: Connect to HostB with credentials
    IKE->>Dawn: Verify connection exists
    Dawn-->>IKE: Connection details with both credentials
    IKE->>HostB: Initiate IKE negotiation
    
    Note over HostA,HostB: IKE Phase 1
    HostA->>HostB: IKE_SA_INIT
    HostB->>HostA: IKE_SA_INIT response
    HostA->>HostB: IKE_AUTH (using credential from Connection)
    HostB->>HostA: IKE_AUTH response (using credential from Connection)
    
    Note over HostA,HostB: IKE Phase 2
    HostA->>HostB: CREATE_CHILD_SA (AH parameters)
    HostB->>HostA: CREATE_CHILD_SA response
    
    Note over HostA,HostB: Secure Communication
    HostA->>HostB: IP Packets with AH headers
    HostB->>HostA: IP Packets with AH headers
    
    Note over HostA,HostB: Optional: Connection Maintenance
    alt Key Rotation
        Authority->>Dawn: registerConnection(new credentials)
        Dawn-->>Authority: Updated Connection
        Authority->>HostA: New connection details (off-chain)
        Authority->>HostB: New connection details (off-chain)
        Note over HostA,HostB: Rekey process in IKE
    else Revoke Connection
        Authority->>Dawn: revokeConnection()
        Dawn-->>Authority: Connection closed
        Authority->>HostA: Revocation notice (off-chain)
        Authority->>HostB: Revocation notice (off-chain)
    end
```

## On-Chain Implementation

Our Dawn AMF implementation stores IPsec parameters and credentials directly in the Connection account, which is more appropriate for two-way authentication protocols like IPsec AH:

```mermaid
classDiagram
    class IPsecAHParams {
        algorithm: IPsecAlgorithm
        keyLifetime: number
        mode: IPsecMode
        spi: number
        replayWindowSize: number
        useExtendedSequence: boolean
        ikeParams: IKEv2Params
    }

    class Connection {
        auth_method: Pubkey
        entity_a: Pubkey
        entity_b: Pubkey
        credential_data_a: [u8; 64]
        credential_data_b: [u8; 64]
    }

    class AuthMethod {
        authority: Pubkey
        method_type: AuthMethodType
        parameters: [u8; 256]
    }

    AuthMethod -- Connection: configures >
    IPsecAHParams -- AuthMethod: stored in parameters
```

## Two-Way vs One-Way Authentication

Unlike 802.1X which uses one-way authentication (client authenticating to network), IPsec AH requires mutual authentication between both entities. This is why our implementation:

- Stores credentials for both entities directly in the Connection account
- Does not require separate Credential accounts for each entity

This approach simplifies the authentication flow and better matches the IPsec protocol model where both parties need access to each other's authentication information.

## Security Considerations

Our implementation prioritizes security through:

- Support for modern, secure hash algorithms
- Anti-replay protection with configurable window size
- Extended sequence numbers for high-volume connections
- IKEv2 for secure key exchange
- Regular key rotation via configurable key lifetimes
- Perfect Forward Secrecy through Diffie-Hellman key exchange

## Usage

To register an IPsec AH authentication method and connection for a Dawn network:

1. Create an `IPsecAHParams` instance with appropriate settings
2. Register the authentication method using `registerAuthMethod`
3. Generate credential data for each entity using `generateIPsecAHCredential`
4. Register a connection with both credentials using `registerConnection`

See the test file (`tests/dawn/09_amf.ts`) for a complete example of registering an IPsec AH authentication method and establishing a connection.