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
  // raydium
  raydium: string
  raydiumConfig: string
  raydiumPool: string
  // mints
  usdcMint: string
  dawnMint: string
  // token accounts
  userUsdcAccount: string
  userDawnAccount: string
  daoDawnAccount: string
  validatorDawnAccount: string
  medallionDawnAccount: string
  boDawnAccount: string
  testerUsdcAccount: string
  // plan accounts
  configPda: string
}
