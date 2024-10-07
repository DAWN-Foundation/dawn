export interface Keypair {
  secretKey: string
  publicKey: string
}

export interface PlanInitConfig {
  root: Keypair
  andrena: Keypair
  dawn: Keypair
  buildingOwner: Keypair
  tester: Keypair
  usdcMint: string
  dawnMint: string
  andrenaUsdcAccount: string
  andrenaDawnAccount: string
  dawnUsdcAccount: string
  boUsdcAccount: string
  testerUsdcAccount: string
  configPda: string
}
