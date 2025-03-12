import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { connect, getMock, submitTx } from './utils'
import { SystemProgram } from '@solana/web3.js'

async function main() {
  const mock = getMock()
  const { wallet, connection, program } = await connect()

  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const itx = await program.methods
    .configure(mock.daoFee, mock.validatorFee, mock.medallionFee)
    .accounts({
      caller: wallet.payer.publicKey,
      tokenConfig: mock.tokenConfigPda,
      config: mock.configPda,
      usdcMint: mock.usdcMint,
      dawnMint: mock.dawnMint,
      feePoolDawnAccount: mock.feePoolDawnAccount,
      daoDawnAccount: mock.daoDawnAccount,
      validatorDawnAccount: mock.validatorDawnAccount,
      medallionDawnAccount: mock.medallionDawnAccount,
      raydium: mock.raydium,
      raydiumAuthority: mock.raydiumAuthority,
      raydiumConfig: mock.raydiumConfig,
      raydiumPool: mock.raydiumPool,
      raydiumObservation: mock.raydiumObservation,
    })
    .signers([wallet.payer])
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx)
    console.log('Tx submitted', { txResult })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
