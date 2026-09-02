import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { getWallet, getFlag, hasFlag } from '../../shared/cli-utils'

// Default Solana derivation path. Phantom's account N is 44'/501'/N'/0'.
const DEFAULT_LEDGER_PATH = "44'/501'/0'"

/**
 * A transaction signer that can be either a local keypair or a Ledger device.
 * Callers build the instructions and use `signSendConfirm`, so the same code
 * path works for both — the difference is only how the signature is produced.
 */
export interface TxSigner {
  readonly publicKey: PublicKey
  readonly label: string
  /**
   * Add this signer's signature to an already-assembled legacy transaction
   * (feePayer + recentBlockhash + instructions must already be set).
   */
  signTransaction(tx: Transaction): Promise<void>
}

class LocalSigner implements TxSigner {
  readonly label = 'local keypair'
  constructor(private readonly keypair: Keypair) {}
  get publicKey(): PublicKey {
    return this.keypair.publicKey
  }
  async signTransaction(tx: Transaction): Promise<void> {
    tx.partialSign(this.keypair)
  }
}

class LedgerSigner implements TxSigner {
  readonly label = 'ledger'
  private constructor(
    readonly publicKey: PublicKey,
    // typed as `any`: the @ledgerhq packages are optional deps loaded via
    // require() below so they never couple the build / non-Ledger installs.
    private readonly app: any,
    private readonly path: string,
  ) {}

  static async create(path: string): Promise<LedgerSigner> {
    let TransportNodeHid: any
    let Solana: any
    try {
      // require() (not import) so the optional native deps don't couple tsc/CI.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      TransportNodeHid = require('@ledgerhq/hw-transport-node-hid').default
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      Solana = require('@ledgerhq/hw-app-solana').default
    } catch {
      throw new Error(
        'Ledger support needs the optional deps. Install them with:\n' +
          '  yarn add --optional @ledgerhq/hw-transport-node-hid @ledgerhq/hw-app-solana',
      )
    }
    const transport = await TransportNodeHid.create()
    const app = new Solana(transport)
    const { address } = await app.getAddress(path)
    return new LedgerSigner(new PublicKey(address), app, path)
  }

  async signTransaction(tx: Transaction): Promise<void> {
    // The Ledger signs the serialized message; add the returned signature.
    const message = tx.serializeMessage()
    const { signature } = await this.app.signTransaction(this.path, message)
    tx.addSignature(this.publicKey, signature)
  }
}

/**
 * Resolve the transaction signer from CLI flags:
 *   --ledger [--ledger-path "44'/501'/0'"]  -> hardware wallet
 *   (default)                               -> local keypair (getWallet)
 */
export async function getTxSigner(): Promise<TxSigner> {
  if (hasFlag('--ledger')) {
    const path = getFlag('--ledger-path') ?? DEFAULT_LEDGER_PATH
    console.log(`Connecting to Ledger (derivation path ${path})...`)
    const signer = await LedgerSigner.create(path)
    console.log(`Ledger address: ${signer.publicKey.toBase58()}`)
    console.log('Approve each transaction on the device when prompted.')
    return signer
  }
  return new LocalSigner(getWallet().payer)
}

/**
 * Assemble a legacy transaction from `instructions`, sign it (any local
 * `extraSigners` first, then the main `signer`), send it, and confirm at the
 * given commitment. Use `commitment: 'finalized'` between dependent Squads
 * steps to avoid load-balanced-RPC races.
 */
export async function signSendConfirm(
  connection: Connection,
  instructions: TransactionInstruction[],
  signer: TxSigner,
  opts: { extraSigners?: Keypair[]; commitment?: Commitment } = {},
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction({ feePayer: signer.publicKey, blockhash, lastValidBlockHeight })
  tx.add(...instructions)
  for (const kp of opts.extraSigners ?? []) {
    tx.partialSign(kp)
  }
  await signer.signTransaction(tx)
  const signature = await connection.sendRawTransaction(tx.serialize())
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    opts.commitment ?? 'confirmed',
  )
  return signature
}
