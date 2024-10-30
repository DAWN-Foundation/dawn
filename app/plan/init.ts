import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

import { connect, getMock, submitTx } from './utils'

async function main() {
  const { wallet, connection, program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const mock = getMock()

  const itx = await program.methods
    .initialize(mock.daoFee, mock.validatorFee, mock.medallionFee)
    .accounts({
      caller: wallet.payer.publicKey,
      config: mock.configPda,
      usdcMint: mock.usdcMint,
      dawnMint: mock.dawnMint,
      daoDawnAccount: mock.daoDawnAccount,
      validatorDawnAccount: mock.validatorDawnAccount,
      medallionDawnAccount: mock.medallionDawnAccount,
      raydium: mock.raydium,
      raydiumAuthority: mock.raydiumAuthority,
      raydiumConfig: mock.raydiumConfig,
      raydiumPool: mock.raydiumPool,
      raydiumObservation: mock.raydiumObservation,
    })
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx)
    console.log('Tx submitted', { txResult })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
