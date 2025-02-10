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
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'
import { BankrunProvider } from 'anchor-bankrun'

interface SiteAdded {
  owner: PublicKey
  site: PublicKey
  name: string
  createdAt: number
}

export const siteTests = () =>
  describe('dawn::site', () => {
    let program: Program<Dawn>
    let provider: BankrunProvider

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.serviceProvider)

      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)
    })

    test('mock setup', () => {
      expect(mock).toBeDefined()
    })

    test('cannot add site without name', async () => {
      const name = ''

      const [sitePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('site'),
          Buffer.from(mock.serviceProvider.publicKey.toBytes()),
          Buffer.from(name),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addSite(name)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            site: sitePda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid site name')
      }
    })

    test('adds the site', async () => {
      const tx = await program.methods
        .addSite(mock.siteName)
        .accounts({
          caller: mock.serviceProvider.publicKey,
          site: mock.sitePda,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<SiteAdded>(program, txDetails, 'SiteAdded')
      expect(event.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(event.site.equals(mock.sitePda)).toBeTruthy()
      expect(event.name).toBe(mock.siteName)
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure site was created
      const site = await program.account.site.fetch(mock.sitePda)
      expect(new BN(site.createdAt).gt(new BN(0))).toBeTruthy()
      expect(site.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(site.name).toBe(mock.siteName)
    })
  })
