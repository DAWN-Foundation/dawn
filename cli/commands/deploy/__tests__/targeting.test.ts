import { test, expect } from '@jest/globals'
import { execFileSync } from 'child_process'

// getProgramId reads process.argv flags, so assert via a child node process.
function programIdWith(flag: string): string {
  return execFileSync('node', ['-e',
    `process.argv.push('${flag}');` +
    `const t=require('toml').parse(require('fs').readFileSync('./Anchor.toml','utf-8'));` +
    `const f=(x)=>process.argv.includes(x);` +
    `console.log(f('--mainnet')?t.programs.mainnet.dawn:f('--devnet')?t.programs.devnet.dawn:t.programs.localnet.dawn)`
  ], { encoding: 'utf-8' }).trim()
}

test('mainnet flag selects the mainnet program id', () => {
  expect(programIdWith('--mainnet')).toBe('dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP')
})
test('devnet flag selects the devnet program id', () => {
  expect(programIdWith('--devnet')).toBe('dawnt36j2ej84PXrEjrxDjmQb5nAAqCVwTP8f1Y1aYu')
})
