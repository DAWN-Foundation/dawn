import { BN, Program } from '@coral-xyz/anchor'
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from '@solana/web3.js'
import { Dawn } from '../../../target/types/dawn'
import {
  getConfigPda, getTokenConfigPda,
  getFeePoolDawnAccountPda, getDaoDawnAccountPda,
  getValidatorDawnAccountPda, getMedallionDawnAccountPda,
} from '../../../sdk/pda/config'
import { METADATA_PROGRAM_ID } from '../../../sdk/utils'

export const PLACEHOLDER = SystemProgram.programId
export const MAINNET_USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')

function dawnMintPda(program: Program<Dawn>): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('dawn')], program.programId)[0]
}

export async function buildTokenInstructions(
  program: Program<Dawn>, vaultPda: PublicKey,
): Promise<TransactionInstruction[]> {
  const tokenConfig = getTokenConfigPda(program)
  const dawnMint = dawnMintPda(program)
  const callerDawnAccount = getAssociatedTokenAddressSync(dawnMint, vaultPda, true)

  const initToken = await program.methods.initToken().accountsStrict({
    caller: vaultPda,
    tokenConfig,
    dawnMint,
    callerDawnAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  }).instruction()

  const initFeeAccounts = await program.methods.initFeeAccounts().accountsStrict({
    caller: vaultPda,
    tokenConfig,
    dawnMint,
    feePoolDawnAccount: getFeePoolDawnAccountPda(program),
    daoDawnAccount: getDaoDawnAccountPda(program),
    validatorDawnAccount: getValidatorDawnAccountPda(program),
    medallionDawnAccount: getMedallionDawnAccountPda(program),
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  }).instruction()

  return [initToken, initFeeAccounts]
}

export async function buildConfigInstructions(
  program: Program<Dawn>, vaultPda: PublicKey,
  opts: { stableMint: PublicKey; daoFee: BN; validatorFee: BN; medallionFee: BN },
): Promise<TransactionInstruction[]> {
  const tokenConfig = getTokenConfigPda(program)
  const dawnMint = dawnMintPda(program)
  const [config] = getConfigPda(program)

  const initializeConfig = await program.methods
    .initializeConfig(opts.daoFee, opts.validatorFee, opts.medallionFee)
    .accountsStrict({
      caller: vaultPda,
      apiAuthority: vaultPda,
      tokenConfig,
      config,
      stableMint: opts.stableMint,
      dawnMint,
      feePoolDawnAccount: getFeePoolDawnAccountPda(program),
      daoDawnAccount: getDaoDawnAccountPda(program),
      validatorDawnAccount: getValidatorDawnAccountPda(program),
      medallionDawnAccount: getMedallionDawnAccountPda(program),
      raydium: PLACEHOLDER,
      raydiumAuthority: PLACEHOLDER,
      raydiumConfig: PLACEHOLDER,
      raydiumPool: PLACEHOLDER,
      raydiumObservation: PLACEHOLDER,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    }).instruction()

  const [metadata] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), dawnMint.toBuffer()],
    METADATA_PROGRAM_ID,
  )
  const initMetadata = await program.methods.initMetadata().accountsStrict({
    caller: vaultPda,
    tokenConfig,
    config,
    dawnMint,
    metadata,
    tokenMetadataProgram: METADATA_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  }).instruction()

  return [initializeConfig, initMetadata]
}
