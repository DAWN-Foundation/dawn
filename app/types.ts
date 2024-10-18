export interface Keypair {
  secretKey: string
  publicKey: string
}

export interface TestnetConfig {
  wallet: string
  dao: Keypair
  validatorPool: Keypair
  medallionPool: Keypair
  buildingOwner: Keypair
  tester: Keypair
  raydium: string
  // mints
  usdcMint: string
  dawnMint: string
  // token accounts
  daoDawnAccount: string
  validatorDawnAccount: string
  medallionDawnAccount: string
  boDawnAccount: string
  testerUsdcAccount: string
  // PDA
  configPda: string
  poolPda: string
}
