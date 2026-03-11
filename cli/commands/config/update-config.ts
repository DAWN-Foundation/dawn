import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { connect, getMock, submitTx } from '../../shared/cli-utils'
import { SystemProgram } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'

/**
 * Update protocol configuration (authority-gated)
 *
 * This command updates the protocol configuration. Only the authority can call this.
 * All parameters are optional - pass null to keep existing values.
 *
 * Usage:
 *   ts-node cli/commands/config/update-config.ts
 */
async function main() {
  const mock = getMock()
  const { wallet, connection, program } = await connect()

  console.log({ PROGRAM_ID: program.programId.toBase58() })
  console.log({ Authority: wallet.payer.publicKey.toBase58() })

  // Example: Update only the dao fee, keep everything else
  const newDaoFee = new BN(200) // 200 BPS = 2%

  const itx = await program.methods
    .updateConfig(
      newDaoFee, // Update dao fee
      null, // Keep validator fee
      null, // Keep medallion fee
      null, // Keep raydium program
      null, // Keep raydium authority
      null, // Keep raydium pool
      null, // Keep raydium config
      null, // Keep raydium observation
      null, // Keep api authority
    )
    .accountsStrict({
      caller: wallet.payer.publicKey,
      tokenConfig: mock.tokenConfigPda,
      config: mock.configPda,
      stableMint: mock.stableMint,
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
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([wallet.payer])
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx)
    console.log('Config updated successfully', { txResult })

    // Fetch and display updated config
    const config = await program.account.config.fetch(mock.configPda)
    console.log('\nUpdated Configuration:')
    console.log('  Authority:', config.authority.toBase58())
    console.log('  DAO Fee:', config.daoFee.toString(), 'BPS')
    console.log('  Validator Fee:', config.validatorFee.toString(), 'BPS')
    console.log('  Medallion Fee:', config.medallionFee.toString(), 'BPS')
  } catch (error) {
    console.error('Failed to update config:', error)
  }
}

main().catch(console.error)
