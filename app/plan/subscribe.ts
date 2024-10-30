import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'

import { Plan } from '../../target/types/plan'
import {
  connect,
  getMock,
  getFlag,
  getIDL,
  getPlanPda,
  getWallet,
  submitTx,
} from './utils'

async function main() {
  const plan = getFlag('--plan')
  if (!plan) {
    throw new Error('--plan is required')
  }
  const planPda = new PublicKey(plan)

  const { wallet, connection, program } = await connect()
  const mock = getMock()

  // for now ensure wallet is tester
  if (wallet.publicKey.toBase58() !== mock.tester.publicKey.toBase58()) {
    throw new Error('Wallet must be tester [for now]')
  }

  const configPda = new PublicKey(mock.configPda)
  const userUsdcAccount = new PublicKey(mock.testerUsdcAccount)

  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const [subscriptionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('subscription'),
      Buffer.from(planPda.toBytes()),
      Buffer.from(wallet.publicKey.toBytes()),
    ],
    program.programId,
  )

  console.log({ subscriptionPda: subscriptionPda.toBase58() })

  // const itx = await program.methods
  //   .subscribe()
  //   .accounts({
  //     caller: wallet.publicKey,
  //     config: configPda,
  //     plan: planPda,
  //     subscription: subscriptionPda,
  //     andrenaUsdcAccount,
  //     dawnUsdcAccount,
  //     boUsdcAccount,
  //     userUsdcAccount,
  //   } as {})
  //   .instruction()

  // try {
  //   const txResult = await submitTx(connection, wallet, itx)
  //   console.log('Tx submitted', { txResult })
  // } catch (error) {
  //   console.error(error)
  // }
}

main().catch(console.error)
