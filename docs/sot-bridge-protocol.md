# SoT-Bridge ↔ DAWN Chain Integration

Subscription contract for a dawn-node SoT-bridge process that watches
the lean access-domain protocol on Solana, decrypts incoming
credentials, and configures an off-chain AAA service (FreeRADIUS,
hostapd, etc).

This doc is the only source the bridge needs. All discriminators,
field offsets, and crypto recipes are baked in. Do not read the
program source unless something here disagrees with observed bytes.

---

## 1. Identity model

Three on-chain roles plus the bridge:

| Role | Held by | Authority for |
|---|---|---|
| **Cold admin** | Operator HSM | `Config.authority`; one-shot `initialize_config`, periodic `update_config_authority`. |
| **Operator** | Operator HSM (same key as cold admin in the simple model) | `AccessDomain.owner`; signs `add_access_domain`, `set_*`, `grant/revoke_domain_authority_for_access_domain`, `register_auth_method`. |
| **Registrar** | Operator-api server (hot wallet) | A live `DomainAuthority{role=Registrar}` PDA. Signs `register_credential_for`. Rotatable; expirable. |
| **Control-plane authority** | **You — the SoT-bridge** | Owns the `Device` PDA referenced by `AccessDomain.control_plane_device`. Holds the Ed25519 secret that decrypts every `Credential.sealed_payload`. Never signs on-chain transactions in normal operation. |

The bridge's job:

- **Read-only on-chain.** It does not sign txs.
- **Decryption-only with its keypair.** The Ed25519 secret never leaves the
  process. Used purely to open sealed-box envelopes.
- **State sync into RADIUS.** New credential → enroll in the radio config.
  Revoked credential → drop. Auth-method param change → reload SSID/security.

You will be told the **operator pubkey** out-of-band (it is the on-chain
identity of the deploying party). Your subscription anchor is "every
AccessDomain whose `owner` equals that pubkey, and the downstream
records that point at any of those AccessDomains."

---

## 2. Network endpoints

```
program id (devnet): rHSumT63fgwAsHhKbR39AijjY28H99VuvM8xNaNehkj
RPC  (HTTP):         https://api.devnet.solana.com
RPC  (WebSocket):    wss://api.devnet.solana.com/
commitment:          confirmed   (use 'finalized' if you want to wait
                                   ~12.8s for absolute irreversibility;
                                   confirmed is ~0.5s and fine for AAA
                                   given the reorg properties below)
```

For mainnet later, swap the RPC URL and `cfg(feature = "devnet")` baked
program ID. The account/event byte layouts are identical across
clusters.

---

## 3. Account types the bridge cares about

Every Anchor account has an 8-byte discriminator at offset 0,
followed by Borsh-encoded fields in declaration order. Borsh is just
little-endian; fixed-size scalars and `[u8; N]` arrays are raw, `String`
is `u32 length || utf-8 bytes`, `Option<T>` is `1 byte tag (0 or 1) || T
if tag==1`, `Pubkey` is `[u8; 32]`.

### 3.1 `AccessDomain` — primary subscription anchor

Discriminator: **`11ff3f5b900dbcae`** (hex), `Ef8/W5ANvK4=` (base64).

| Offset | Size | Field | Notes |
|---:|---:|---|---|
| 0 | 8 | discriminator | constant above |
| 8 | 8 | `created_at` | i64 unix seconds |
| 16 | 32 | **`owner`** | filter target — operator pubkey |
| 48 | 32 | **`control_plane_device`** | bridge's Device PDA |
| 80 | 33 | `gateway_device` | `Option<Pubkey>` (1 byte tag + 32 if Some) |
| 80+33 | 33 | `local_domain` | `Option<Pubkey>` |
| 80+66 | 17 | `external_uuid` | `Option<[u8; 16]>` (Nautobot site UUID; treat as opaque) |
| variable | 4+N | `name` | `String`, max 32 bytes (SSID label) |
| ... | 1 | `bump` | PDA bump |

Total size with optionals all None and a 32-byte name: 8 + 8 + 32 + 32 + 1 + 1 + 1 + 4 + 32 + 1 = **120 bytes**.
With all optionals Some and a 32-byte name: **216 bytes** (≤ this is the upper bound).

> Optional fields at variable offsets — you can't memcmp on anything past
> `control_plane_device` cheaply. All filters needed by the bridge are
> at offsets ≤ 48, so this is fine.

### 3.2 `AuthMethod`

Discriminator: **`cacea904722c48b6`**, `ys6pBHIsSLY=`.

| Offset | Size | Field |
|---:|---:|---|
| 0 | 8 | discriminator |
| 8 | 8 | `created_at` (i64) |
| 16 | 32 | `authority` |
| 48 | 32 | **`access_domain`** ← filter target |
| 80 | 1 | `method_type` (enum: 0=Psk, 1=Mpsk) |
| 81 | 256 | `parameters` (fixed buffer; see §3.2.1) |
| 337 | 1 | `bump` |

**Total: 338 bytes — fixed.** Listing this account by `access_domain` is
cheap and reliable (memcmp at offset 48).

#### 3.2.1 `parameters[256]` for Psk/Mpsk

Bytes 0..128 of the `parameters` buffer carry `PSKMethodParams`:

| Offset (within parameters) | Size | Field |
|---:|---:|---|
| 0 | 1 | `security_standard` (0=WPA2-PSK, 1=WPA3-PSK) |
| 1 | 1 | `encryption_algorithm` (0=AES-CCMP, 1=AES-GCMP, 2=AES-GCMP-256) |
| 2 | 4 | `psk_rotation_interval` (u32 LE seconds; 0 = no rotation; otherwise 3600..=604800) |
| 6 | 1 | `ssid_2_4ghz_len` |
| 7 | 32 | `ssid_2_4ghz` (utf-8, zero-padded; only first `_len` bytes are real) |
| 39 | 1 | `ssid_5ghz_len` |
| 40 | 32 | `ssid_5ghz` |
| 72 | 1 | `ssid_6ghz_len` |
| 73 | 32 | `ssid_6ghz` |
| 105 | 23 | `_reserved` (zero) |

Bytes 128..256 of the buffer are reserved for future per-band fields.
At least one of the three SSID slots will have `len > 0`.

### 3.3 `Credential` — the hot path

Discriminator: **`912c44dc432e6487`**, `kSxE3EMuZIc=`.

#### 3.3.1 Fixed-offset prefix (safe to memcmp)

| Offset | Size | Field |
|---:|---:|---|
| 0 | 8 | discriminator |
| 8 | 8 | `created_at` (i64) |
| 16 | 32 | **`authority`** — the customer pubkey |
| 48 | 32 | **`access_domain`** — filter target |
| 80 | 32 | **`auth_method`** — joinable to AuthMethod |

Use these offsets for `getProgramAccounts` / `programSubscribe`
filtering. **Do not memcmp on anything past offset 112** — the rest is
Borsh-encoded with `Option<>`s and is variable-length.

#### 3.3.2 Variable-offset suffix (parse sequentially from offset 112)

```
Option<Pubkey>  subscription   (1 byte tag, +32 if Some) — always None on this build
Option<Pubkey>  plan           (1 byte tag, +32 if Some) — always None on this build
Option<u16>     vlan_id        (1 byte tag, +2 if Some)
Option<u8>      qos_tag        (1 byte tag, +1 if Some)
[u8; 128]       sealed_payload
u8              bump
```

Because `subscription` and `plan` are guaranteed None today, the
**actual** byte offsets in current accounts are:

| Offset | Size | Field |
|---:|---:|---|
| 112 | 1 | `subscription` tag (= 0) |
| 113 | 1 | `plan` tag (= 0) |
| 114 | 1+2 | `vlan_id` |
| 117 | 1+1 | `qos_tag` |
| 119 | 128 | `sealed_payload` |
| 247 | 1 | `bump` |

The account *allocation* is **312 bytes** (Anchor sizes it for the worst
case where both Options are Some), so bytes 248..312 are zero. If/when
the program ever starts writing `subscription` or `plan` as Some, these
absolute offsets shift right by 32 bytes per Some — re-derive at parse
time. Sequential Borsh decode is safe; absolute offsets past 112 are
not.

### 3.4 `DomainAuthority`

Discriminator: **`cc3616e4ccb40c7a`**, `zDYW5My0DHo=`.

| Offset | Size | Field |
|---:|---:|---|
| 0 | 8 | discriminator |
| 8 | 8 | `created_at` (i64) |
| 16 | 32 | **`domain`** — AccessDomain PDA, filter target |
| 48 | 32 | `authority` — registrar / config-plane manager wallet |
| 80 | 1 | `role` (0=Registrar, 1=ConfigPlaneManager) |
| 81 | 32 | `created_by` — operator key at grant time |
| 113 | 4+N (variable) | `label` — `Option<String>`, max 32 bytes inside |
| variable | 9 | `expires_at` — `Option<i64>` |
| ... | 1 | `bump` |

The bridge does not need to act on these but should track them for the
audit trail and for the warning lights ("a Registrar grant for our
domain just expired but is still on-chain — operator should clean up").

### 3.5 `Device` (only your own)

Discriminator: **`99f81727532d4480`**, `mfgXJ1MtRIA=`.

The bridge's wallet is the `owner` of one Device account (registered
during initial setup by the operator). Memorize that Device PDA; you
won't need to query for it after the first bootstrap. AccessDomains
will reference it via `control_plane_device`.

### 3.6 Other accounts

`Config`, `DeviceModel`, `DeviceLocation`, `LocalDomain` exist on-chain
but are not relevant to the AAA loop. Skip.

---

## 4. Events the bridge cares about

Events are emitted via `emit!()` and arrive as `Program data: <base64>`
log lines. The base64 decodes to `[8-byte event_disc][borsh body]`.
Subscribe via `logsSubscribe(programId)` and parse.

| Event | Disc (hex) | Disc (b64) | When fires |
|---|---|---|---|
| `AccessDomainAdded` | `2355f149f6a848f6` | `I1XxSfaoSPY=` | `add_access_domain` ix |
| `AccessDomainControlPlaneUpdated` | `d84f44ba1fbc65b5` | `2E9Euh+8ZbU=` | `set_control_plane_device` |
| `AccessDomainGatewayUpdated` | `2b2751a1572e7a58` | `KydRoVcuelg=` | `set_access_domain_gateway_device` |
| `AuthMethodRegistered` | `0533edc21d4b0e4f` | `BTPtwh1LDk8=` | `register_auth_method` |
| `AuthMethodParamsUpdated` | `ff2e50d303403e97` | `/y5Q0wNAPpc=` | `update_auth_method_params` (in-place; same PDA) |
| `CredentialRegistered` | `14de86a13fd1d37d` | `FN6GoT/R030=` | `register_credential_for` |
| `CredentialRevoked` | `7f83f1ea328b91cc` | `f4Px6jKLkcw=` | `revoke_credential` |
| `DomainAuthorityGranted` | `260d1d056c79049b` | `Jg0dBWx5BJs=` | `grant_domain_authority_for_access_domain` |
| `DomainAuthorityRevoked` | `ca17e8c4e578e413` | `yhfoxOV45BM=` | `revoke_domain_authority_for_access_domain` |

Other events (`ConfigInitialized`, `DeviceAdded`, `DeviceLocationAdded`,
`DeviceLocationVerified`, `DeviceModelAdded`, `LocalDomainAdded`,
`ConfigAuthorityUpdated`) exist but the bridge doesn't need them.

### 4.1 Event body layouts

All event bodies are Borsh-encoded in declaration order from
`programs/dawn/src/events.rs`. The `Program data:` log line carries
`base64( [8-byte event_disc] [borsh body] )`.

**`AccessDomainAdded`** body, in wire order:
```
Pubkey          access_domain
Pubkey          owner
Pubkey          control_plane_device
Option<Pubkey>  gateway_device
Option<Pubkey>  local_domain
Option<[u8;16]> external_uuid
String          name
i64             created_at
```

**`CredentialRegistered`** body:
```
Pubkey       credential
Pubkey       authority
Pubkey       access_domain
Pubkey       auth_method
Option<u16>  vlan_id
Option<u8>   qos_tag
i64          created_at
```

**`CredentialRevoked`** body:
```
Pubkey  credential
Pubkey  authority
Pubkey  access_domain
Pubkey  auth_method
i64     revoked_at
```

**`AuthMethodRegistered`** body:
```
Pubkey  auth_method
Pubkey  access_domain
u8      method_type
[u8;256] parameters
i64     created_at
```

**`AuthMethodParamsUpdated`** body:
```
Pubkey  auth_method
Pubkey  access_domain
u8      method_type
Pubkey  updated_by
i64     updated_at
```

> NOTE: `AuthMethodParamsUpdated` does NOT carry the new parameters in
> the event. Re-fetch the AuthMethod account after observing this event
> to get the updated 256-byte buffer.

**`DomainAuthorityGranted`** / `DomainAuthorityRevoked`** bodies — see
`programs/dawn/src/events.rs` (straightforward; rare events).

---

## 5. Subscription recipe

### 5.1 Bootstrap (on bridge startup)

Goal: enumerate every AccessDomain owned by the operator, then for
each one enumerate AuthMethod / Credential / DomainAuthority records.

```js
// === Step 1: list all AccessDomains owned by operator ===
const accessDomains = await rpc.getProgramAccounts(PROGRAM_ID, {
  commitment: 'confirmed',
  filters: [
    { memcmp: { offset: 0,  bytes: ACCESS_DOMAIN_DISC_B58 } },  // discriminator
    { memcmp: { offset: 16, bytes: OPERATOR_PUBKEY_B58 } },      // owner
  ],
});

// === Step 2: for each AD, list AuthMethod / Credential / DomainAuthority ===
for (const { pubkey: adPk, account } of accessDomains) {
  const authMethods = await rpc.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0,  bytes: AUTH_METHOD_DISC_B58 } },
      { memcmp: { offset: 48, bytes: adPk } },
    ],
  });
  const credentials = await rpc.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0,  bytes: CREDENTIAL_DISC_B58 } },
      { memcmp: { offset: 48, bytes: adPk } },
    ],
  });
  const grants = await rpc.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0,  bytes: DOMAIN_AUTHORITY_DISC_B58 } },
      { memcmp: { offset: 16, bytes: adPk } },
    ],
  });
  // Decode and rebuild your local model.
}
```

`memcmp.bytes` is **base58**-encoded for `getProgramAccounts`. Convert
hex discriminators above with any base58 lib.

### 5.2 Live subscription

Run **two parallel subscriptions:**

#### A. `programSubscribe` — account state changes

```js
rpc.programSubscribe(PROGRAM_ID, {
  commitment: 'confirmed',
  encoding: 'base64',
  filters: [
    // No global discriminator filter — we want everything the program
    // owns, then dispatch in code by reading bytes 0..8.
    // Memcmp filters here would have to repeat per account type
    // anyway, so it's cleaner to dispatch in code.
  ],
});
```

For each account update notification, read the first 8 bytes and
dispatch to the right decoder. Filter inside your handler:
- `AccessDomain` && `owner == operator` → cache.
- `AuthMethod` && `access_domain ∈ cached_ads` → update.
- `Credential` && `access_domain ∈ cached_ads` → enroll/refresh.
- `DomainAuthority` && `domain ∈ cached_ads` → audit log.
- Anything else → drop.

This single subscription gives you all account writes and updates.
**Account closures (revocations) do NOT show up here** — see §5.4.

#### B. `logsSubscribe` — events + revocation detection

```js
rpc.logsSubscribe(
  { mentions: [PROGRAM_ID.toBase58()] },
  { commitment: 'confirmed' },
);
```

For each tx-log notification, walk the log lines. `Program data: <b64>`
lines are emitted events. Decode the first 8 bytes of the body to
match against the table in §4.1.

The two streams are complementary: programSubscribe gives you the
authoritative current account state; logsSubscribe gives you intent
("this tx revoked credential X") and the order in which things
happened.

### 5.3 Detecting newly-created AccessDomains live

The bootstrap query in §5.1 captures the historical set. To learn of a
new AccessDomain after that:

- `programSubscribe` will fire when the new AD account first appears
  (init). Read bytes 16..48 to extract `owner`. If
  `owner == operator_pubkey`, add to your cached set and run §5.1
  step 2 for the new AD.

You don't need a separate subscription for "new ADs". `programSubscribe`
covers it.

### 5.4 Revocation handling

`revoke_credential` and `revoke_domain_authority_for_access_domain` are
Anchor `close=` instructions. The account ceases to exist. Detection:

- **Authoritative path:** `logsSubscribe`. When you see a
  `CredentialRevoked` event (disc `7f83f1ea328b91cc`), the body carries
  the credential PDA. Drop it from your local state. Same for
  `DomainAuthorityRevoked`.
- **Backup path:** `accountSubscribe` per credential. When a watched
  account becomes nonexistent (notification with `lamports: 0`,
  `data: null`), treat as closed.

The event-driven path is simpler and the bridge gets the full context
(authority, access_domain, auth_method) in one shot, so prefer it.
Use accountSubscribe only as redundancy if you don't trust your
log-stream connection.

### 5.5 Reorg / atomicity

- **Within a single tx:** atomic. If `register_credential_for` succeeds,
  both the new account state and the `CredentialRegistered` event are
  observable; if it fails, neither is. You won't see half-states.
- **Across confirmation levels:** a `confirmed` event is reversible
  if the slot reorgs (very rare on devnet/mainnet, ~0.1% of slots).
  For RADIUS state, two safe options:
  1. Watch at `finalized` commitment (~12.8s lag, no reorgs).
  2. Watch at `confirmed`, accept the small reorg risk (worst case:
     a credential briefly authorizes then is rolled back; you'd have
     to drop it later when you re-watch the same slot range).
- **State reconciliation:** every N minutes (or on websocket reconnect),
  re-run the §5.1 enumeration and compare to your cached state.
  Anything in the cache that's not on-chain anymore → drop. Anything
  on-chain that's not cached → re-ingest.

---

## 6. Sealed-payload decryption

`Credential.sealed_payload[128]` is a libsodium `crypto_box_seal`
envelope. Recipient is the Solana pubkey `access_domain.control_plane_device.owner`
(your wallet). The library handles Ed25519↔Curve25519 conversion under
the hood.

### 6.1 Wire layout

```
bytes  0..32   ephemeral Curve25519 public key
bytes 32..128  ciphertext || Poly1305 tag, zero-padded to 128
```

### 6.2 Plaintext layout (after decrypt — exactly 80 bytes)

```
byte  0       version (= 1)
byte  1       kind     (1 = psk-utf8)
byte  2       psk_len  (1..=63)
bytes 3..3+psk_len   PSK as utf-8
bytes 3+psk_len..80  zero pad
```

Plaintext is always 80 bytes regardless of PSK length, so PSK length
isn't leaked via ciphertext length.

### 6.3 Reference implementation (Python)

```python
# pip install pynacl
from nacl.public import PrivateKey, SealedBox
from nacl.signing import SigningKey

def decrypt_credential_payload(
    ed25519_secret_seed: bytes,   # 32 bytes; the bridge's wallet seed
    sealed_payload: bytes,         # 128 bytes, Credential.sealed_payload
) -> str:
    assert len(ed25519_secret_seed) == 32
    assert len(sealed_payload) == 128

    # Solana keypair files store seed||pubkey (64 bytes). If you have
    # that form, slice [:32] to get the seed.

    # Convert Ed25519 signing key → Curve25519 box (encryption) key.
    sk_x25519 = SigningKey(ed25519_secret_seed).to_curve25519_private_key()
    box = SealedBox(sk_x25519)

    # The 128 on-chain bytes are exactly the libsodium sealed-box
    # output: 32 (ephemeral pk) + 96 (ciphertext + Poly1305 tag) for
    # an 80-byte plaintext. No padding to strip.
    framed = box.decrypt(sealed_payload)  # returns 80 bytes

    version, kind, psk_len = framed[0], framed[1], framed[2]
    assert version == 1, f"unsupported plaintext version {version}"
    assert kind == 1, f"unsupported plaintext kind {kind}"
    assert 1 <= psk_len <= 63, f"bad PSK length {psk_len}"
    return framed[3:3 + psk_len].decode("utf-8")
```

### 6.4 Operational notes

- **Decryption is offline.** The bridge does not need a network call to
  decrypt. The sealed_payload bytes from `programSubscribe` are
  sufficient.
- **Idempotency.** Operator-api may submit the same credential twice
  (network drops). Both txs target the same `Credential` PDA; the
  second fails at the Anchor `init` constraint and the on-chain
  sealed_payload is unchanged. The bridge sees one
  `CredentialRegistered` event regardless.
- **Rotation** (a future feature). When an MPSK PSK rotates, the
  operator-api will close the existing Credential and register a new
  one. Bridge sees `CredentialRevoked` then `CredentialRegistered` for
  the same `(access_domain, auth_method, authority)` triple. Treat as
  re-keying.

---

## 7. State machine — bridge bootstrap & runtime

```
START
  load operator_pubkey from config
  load my_ed25519_secret from secure storage
  cache ← empty

BOOTSTRAP
  ads ← getProgramAccounts(filter: AccessDomain.disc, owner=operator)
  for each ad in ads:
    cache.access_domains[ad.pubkey] = decode(ad)
    auth_methods   = getProgramAccounts(AuthMethod, ad=ad.pubkey)
    credentials    = getProgramAccounts(Credential, ad=ad.pubkey)
    grants         = getProgramAccounts(DomainAuthority, ad=ad.pubkey)
    for c in credentials:
      psk = decrypt_credential_payload(my_ed25519_secret, c.sealed_payload)
      radius.enroll(c, psk)
    for am in auth_methods:
      radius.set_security_profile(am)

LIVE
  open programSubscribe(PROGRAM_ID)
  open logsSubscribe(mentions=[PROGRAM_ID])
  loop:
    if program-update message:
      type ← bytes[0..8]
      if AccessDomain & owner==operator: refresh_ad(...)
      elif AuthMethod  & ad ∈ cache:    refresh_am(...)
      elif Credential  & ad ∈ cache:    enroll_or_refresh(...)
      elif DomainAuthority & domain ∈ cache: audit(...)
    if log message contains Program-data event:
      disc ← b64decode(line)[0..8]
      if CredentialRevoked:    radius.drop(parse_body(line).credential)
      elif DomainAuthorityRevoked: audit(...)
      ... etc.

PERIODIC RECONCILE (every 5min, also on WS reconnect)
  rerun BOOTSTRAP enumeration
  diff against cache:
    - on-chain but not cached → ingest
    - cached but not on-chain → drop from RADIUS
```

---

## 8. Quick-start config block

Paste into the bridge's config and never recompute:

```ts
export const DAWN_CHAIN = {
  programId:     'rHSumT63fgwAsHhKbR39AijjY28H99VuvM8xNaNehkj',
  rpcUrl:        'https://api.devnet.solana.com',
  wsUrl:         'wss://api.devnet.solana.com/',
  commitment:    'confirmed' as const,

  // Account discriminators (first 8 bytes of account data).
  accountDisc: {
    AccessDomain:    'Ef8/W5ANvK4=',
    AuthMethod:      'ys6pBHIsSLY=',
    Credential:      'kSxE3EMuZIc=',
    DomainAuthority: 'zDYW5My0DHo=',
    Device:          'mfgXJ1MtRIA=',
    Config:          'mwyq4B76zII=',
  },

  // Event discriminators (first 8 bytes of `Program data:` log payload).
  eventDisc: {
    AccessDomainAdded:               'I1XxSfaoSPY=',
    AccessDomainControlPlaneUpdated: '2E9Euh+8ZbU=',
    AccessDomainGatewayUpdated:      'KydRoVcuelg=',
    AuthMethodRegistered:            'BTPtwh1LDk8=',
    AuthMethodParamsUpdated:         '/y5Q0wNAPpc=',
    CredentialRegistered:            'FN6GoT/R030=',
    CredentialRevoked:               'f4Px6jKLkcw=',
    DomainAuthorityGranted:          'Jg0dBWx5BJs=',
    DomainAuthorityRevoked:          'yhfoxOV45BM=',
  },

  // Field offsets within each account body (after the 8-byte disc).
  // Use these as memcmp.offset values in getProgramAccounts /
  // programSubscribe filters. (offset = 0 is the start of the
  // discriminator; field offsets here are absolute byte offsets in
  // the raw account data.)
  offsets: {
    AccessDomain: {
      created_at:           8,
      owner:               16,  // <-- bootstrap filter
      control_plane_device: 48,
    },
    AuthMethod: {
      created_at:    8,
      authority:    16,
      access_domain: 48,        // <-- per-AD filter
      method_type:  80,
      parameters:   81,         // 256 bytes
    },
    Credential: {
      // Fixed-offset prefix — safe to memcmp.
      created_at:     8,
      authority:     16,
      access_domain: 48,        // <-- per-AD filter
      auth_method:   80,
      // Variable-offset suffix — parse Borsh sequentially from offset 112.
      // Current values (with subscription=None, plan=None) are listed
      // for sanity-checking, but DO NOT memcmp on these:
      _suffix_starts_at: 112,
      _vlan_id_today:   114,    // shifts +32 if subscription becomes Some
      _qos_tag_today:   117,
      _sealed_today:    119,    // 128 bytes
      _bump_today:      247,    // account allocation is 312
    },
    DomainAuthority: {
      created_at:  8,
      domain:     16,           // <-- per-AD filter
      authority:  48,
      role:       80,           // 0=Registrar, 1=ConfigPlaneManager
      created_by: 81,
    },
  },
};
```

---

## 9. Operator → bridge handoff checklist

Before the bridge can start watching, it needs from the operator:

1. **`operator_pubkey`** — the cold-admin / `AccessDomain.owner` pubkey.
2. **`my_device_pda`** — the bridge's Device PDA pubkey, as registered
   by the operator via `add_device_for(beneficiary=bridge_pubkey, …)`.
   (The bridge can compute this itself if it knows the
   model/name/mac, but the operator passing it explicitly is simpler.)
3. **The bridge's own Ed25519 secret** — already on the dawn node.

Once those three values are in place, the bridge can start. It does
not need any tx-signing capability.

---

## 10. End-to-end smoke test

Before turning this on for production, validate by:

1. Operator runs `add_access_domain` with `control_plane_device =
   bridge's Device PDA`. Bridge should see the AD appear via §5.3.
2. Operator runs `register_auth_method` with MPSK params. Bridge
   should see `AuthMethodRegistered` and decode the SSID.
3. Operator runs `grant_domain_authority_for_access_domain` for a
   Registrar wallet. Bridge logs the grant.
4. Registrar runs `register_credential_for` for one customer. Bridge
   should:
   - Receive `CredentialRegistered` event,
   - Decrypt `sealed_payload` to recover the PSK,
   - Enroll the customer in RADIUS with the right VLAN+QoS.
5. Operator runs `revoke_credential` for that customer. Bridge should
   receive `CredentialRevoked` and drop the RADIUS row.

The on-chain side of (1)–(5) is what we're about to script next; the
bridge running through 1–5 cleanly is the integration milestone.
