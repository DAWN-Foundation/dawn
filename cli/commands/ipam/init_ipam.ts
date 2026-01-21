import { connect } from '../../shared/cli-utils'
import { ensureRootBlockInitialized } from '../utils/ipam'

async function main() {
    const { wallet, connection, program } = await connect()

  try {
    await ensureRootBlockInitialized(
        program,
        wallet,
        connection,
        wallet.publicKey,
        0,
        0x0a400000,
        14,
    ) // 10.64.0.0/14
    await ensureRootBlockInitialized(
        program,
        wallet,
        connection,
        wallet.publicKey,
        1,
        0x64400000,
        14,
    ) // 100.64.0.0/14
    await ensureRootBlockInitialized(
        program,
        wallet,
        connection,
        wallet.publicKey,
        2,
        0x64600000,
        14,
    ) // 100.96.0.0/14
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
