import * as anchor from '@coral-xyz/anchor'
import { Program, BN, Wallet, AnchorError } from '@coral-xyz/anchor'
import { assert } from 'chai'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

import { Dawn, IDL } from '../../target/types/dawn'
import {
  getEvent,
  mock,
  getProvider,
  PROGRAM_ID,
  confirmTx,
  getPlanPda,
  getSubscriptionPda,
  AuthMethodType,
  getAuthMethodPda,
  loadWallet,
} from '../../app/utils'
import { BankrunProvider } from 'anchor-bankrun'
import { Clock } from 'solana-bankrun'
import { beforeAll, expect } from '@jest/globals'
import { getBalance } from '../../app/dawn/utils'
const SECONDS_PER_DAY = 86_400n
const BPS_DENOMINATOR = new BN(10_000)
const SLIPPAGE_BPS = new BN(9900)

const Q32 = new BN(2).pow(new BN(32))

export const amfTests = () =>
  describe('dawn::amf', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>

    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = wallet
      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)
    })

    test('mock setup', () => {
      assert.exists(mock)
    })

    test('registers 802.1x auth method', async () => {
      const authMethodType: AuthMethodType = { wpa2Enterprise: {} }
      const params = Array.from({ length: 128 }, () => 0)

      const authMethodPda = getAuthMethodPda(program, authMethodType)

      const tx = await program.methods
        .registerAuthMethod(authMethodType, params)
        .accounts({
          caller: wallet.publicKey,
          config: mock.configPda,
          authMethod: authMethodPda,
        })
        .signers([wallet.payer])
        .rpc()

      // make sure the account was created
      const authMethod = await program.account.authMethod.fetch(authMethodPda)
      expect(authMethod.methodType).toStrictEqual(authMethodType)
      expect(authMethod.parameters).toStrictEqual(params)
      expect(authMethod.isActive).toBeTruthy()
    })
  })
