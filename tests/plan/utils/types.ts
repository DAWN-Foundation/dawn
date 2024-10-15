import { BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'

export interface Mock {
  dao: Keypair
  validatorPool: Keypair
  medallionPool: Keypair
  buildingOwner: Keypair
  tester: Keypair
  // mints
  usdcMint: PublicKey
  dawnMint: PublicKey
  // token accounts
  daoDawnAccount: PublicKey
  validatorDawnAccount: PublicKey
  medallionDawnAccount: PublicKey
  boDawnAccount: PublicKey
  testerUsdcAccount: PublicKey
  // raydium
  raydium: PublicKey
  // config
  daoFee: BN
  validatorFee: BN
  medallionFee: BN
}
