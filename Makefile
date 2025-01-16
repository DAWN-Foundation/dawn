localnet:
	solana airdrop --keypair ~/.config/solana/id.json --url l 10000
	anchor deploy --provider.cluster l
	yarn testnet
	yarn dawn:config
	yarn dawn:add_device_model \
		--manufacturer 'MikroTik' \
		--model 'GG69420'
	yarn dawn:add_device \
		--service-provider \
		--device-model 'EWpcfC58UMg4YeWAuvEAoZ7U6CkJhf1S4uZpxV7VdEzi' \
		--latitude '37.774929' \
		--longitude '-122.419418'
	yarn dawn:add_plan \
		--service-provider \
		--device 8QyA9Unt8givxp95MtipG2TUo51rXotj24wjcL1YHSpF \
		--price 100000000 \
		--duration 30 \
		--speed 100 \
		--capacity 1000 \
		--sla 1
