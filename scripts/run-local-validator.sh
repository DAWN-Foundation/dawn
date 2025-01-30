#!/usr/bin/env bash

solana-test-validator \
  --reset \
  --bpf-program CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C raydium/raydium.so \
  --account DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8 raydium/pool_fee_receiver.json \
  --account D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2 raydium/raydium_config.json