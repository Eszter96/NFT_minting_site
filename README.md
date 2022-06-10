## :tada: NFT Minting site

### :sparkles: Features:
- Connect wallet button - Candy Machine UI implementation
- Multiwallet MUI button - Disconnect, Copy address, Connect other wallet - for more info visit [Solana Labs - Wallet Adapter repository](https://github.com/solana-labs/wallet-adapter)
- Balance displayed when wallet is connected
- NFT reveal - users can see the NFTs from the collection that are owned by them
- Multiple NFT minting - limited to remaining elements


### :eyeglasses: Prerequisites:
- NFT collection deployed to Arweave
- node - it is recommended to install the node package manager
- yarn
- ts-node
- env. file with the following content:

```
REACT_APP_CANDY_MACHINE_ID=<Candy Machine ID generated during NFT collection deployment>
REACT_APP_SOLANA_NETWORK=<cluster used for the deployment>
REACT_APP_SOLANA_RPC_HOST=https://metaplex.devnet.rpcpool.com/
```

More info on [Metaplex Docs](https://docs.metaplex.com/candy-machine-v2/getting-started)

------------------------
:open_book: **Useful sources:** </br> </br>
:link: Generating NFT collection:</br> https://github.com/HashLips/hashlips_art_engine </br></br>
:link: Learn how to deploy NFTs and create a simple website:</br> https://buildspace.so/p/ship-solana-nft-collection </br></br>
:link: Getting inspiration for implementing the multiple minting feature from this repo:</br> https://github.com/Fulgurus/candy-machine-v2-responsive-ui/tree/multimint
