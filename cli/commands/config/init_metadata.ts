import { PublicKey, SystemProgram } from '@solana/web3.js'
import { connect, getMock, submitTx } from '../../shared/cli-utils'

const METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
)

export async function addMetadata() {
  const mock = getMock()
  const { wallet, connection, program } = await connect()

  console.log({ PROGRAM_ID: program.programId.toBase58() })

  // Find the metadata PDA
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      mock.dawnMint.toBuffer(),
    ],
    METADATA_PROGRAM_ID,
  )

  console.log('Adding metadata')
  console.log({
    caller: wallet.publicKey.toBase58(),
    metadata: metadataPda.toBase58(),
  })

  const itx = await program.methods
    .initMetadata()
    .accounts({
      caller: wallet.publicKey,
      tokenConfig: mock.tokenConfigPda,
      config: mock.configPda,
      dawnMint: mock.dawnMint,
      metadata: metadataPda,
      tokenMetadataProgram: METADATA_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as {})
    .signers([wallet.payer])
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx)
    console.log('Metadata initialized successfully', { txResult })
  } catch (error) {
    console.error('Failed to initialize metadata:', error)
  }
}

addMetadata().catch(console.error)
