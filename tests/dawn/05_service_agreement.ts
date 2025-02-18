import * as anchor from '@coral-xyz/anchor'
import { Program, AnchorError, Wallet, BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey, SendTransactionError } from '@solana/web3.js'

import { Dawn, IDL } from '../../target/types/dawn'
import {
  getEvent,
  mock,
  getProvider,
  PROGRAM_ID,
  confirmTx,
  COORD_DENOMINATOR,
  loadWallet,
  getServiceAgreementPda,
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'
import { BankrunProvider } from 'anchor-bankrun'
import { getSitePda } from '../../app/utils/pda/site'

interface ServiceAgreementAdded {
  serviceAgreement: PublicKey
  threshold: BN
  payoutRatio: BN
  createdAt: number
}

export const serviceAgreementTests = () =>
  describe('dawn::service_agreement', () => {
    let program: Program<Dawn>
    let provider: BankrunProvider
    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(wallet.payer)

      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)
    })

    test('mock setup', () => {
      expect(mock).toBeDefined()
    })

    test('cannot add service agreement as non-authority', async () => {
      try {
        provider.wallet = new Wallet(mock.serviceProvider)
        const program2 = new Program<Dawn>(IDL, PROGRAM_ID, provider)
        await program2.methods
          .addServiceAgreement(mock.slaThreshold, mock.slaPayoutRatio)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            config: mock.configPda,
            serviceAgreement: mock.serviceAgreementPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('A raw constraint was violated')
      } finally {
        provider.wallet = new Wallet(wallet.payer)
      }
    })

    test('cannot add service agreement with 0 payout ratio', async () => {
      try {
        await program.methods
          .addServiceAgreement(mock.slaThreshold, new BN(0))
          .accounts({
            caller: wallet.publicKey,
            config: mock.configPda,
            serviceAgreement: mock.serviceAgreementPda,
          })
          .signers([wallet.payer])
          .transaction()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('A raw constraint was violated')
      }
    })

    test('adds the service agreement', async () => {
      const tx = await program.methods
        .addServiceAgreement(mock.slaThreshold, mock.slaPayoutRatio)
        .accounts({
          caller: wallet.publicKey,
          config: mock.configPda,
          serviceAgreement: mock.serviceAgreementPda,
        })
        .signers([wallet.payer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<ServiceAgreementAdded>(
        program,
        txDetails,
        'ServiceAgreementAdded',
      )
      expect(
        event.serviceAgreement.equals(mock.serviceAgreementPda),
      ).toBeTruthy()
      expect(event.threshold.eq(mock.slaThreshold)).toBeTruthy()
      expect(event.payoutRatio.eq(mock.slaPayoutRatio)).toBeTruthy()
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure service agreement was created
      const serviceAgreement = await program.account.serviceAgreement.fetch(
        mock.serviceAgreementPda,
      )
      expect(new BN(serviceAgreement.createdAt).gt(new BN(0))).toBeTruthy()
      expect(serviceAgreement.threshold.eq(mock.slaThreshold)).toBeTruthy()
      expect(serviceAgreement.payoutRatio.eq(mock.slaPayoutRatio)).toBeTruthy()
    })
  })
