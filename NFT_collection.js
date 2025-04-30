// SPDX-License-Identifier: MIT
const {
    Client,
    PrivateKey,
    AccountCreateTransaction,
    AccountBalanceQuery,
    Hbar,
    TransferTransaction,
    TokenCreateTransaction,
    TokenType,
    TokenSupplyType,
    TokenMintTransaction,
    TokenAssociateTransaction
} = require("@hashgraph/sdk");

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

async function environmentSetup() {
    try {
        // Parse account credentials from environment variables
        const myAccountId = process.env.MY_ACCOUNT_ID;
        let myPrivateKey = process.env.MY_PRIVATE_KEY;

        if (!myAccountId || !myPrivateKey) {
            throw new Error("Environment variables MY_ACCOUNT_ID and MY_PRIVATE_KEY must be present");
        }

        console.log(`Using account ID: ${myAccountId}`);
        
        // Convert the private key properly based on its format
        // If your key begins with "302e" it's likely DER encoded
        // If it's a plain hex string, use the appropriate method
        let privateKeyObject;
        try {
            if (myPrivateKey.startsWith("302e") || myPrivateKey.startsWith("302d")) {
                // DER encoded key
                privateKeyObject = PrivateKey.fromStringDer(myPrivateKey);
            } else {
                // Try ED25519 format
                privateKeyObject = PrivateKey.fromStringED25519(myPrivateKey);
            }
        } catch (keyError) {
            console.error("Failed to parse private key:", keyError.message);
            console.error("Please check your private key format in the .env file");
            
            // As a fallback, try the deprecated method with a warning
            try {
                privateKeyObject = PrivateKey.fromString(myPrivateKey);
                console.log("WARNING: Using deprecated key parsing method.");
            } catch (fallbackError) {
                console.error("All key parsing methods failed. Please verify your key format.");
                throw fallbackError;
            }
        }

        // Configure the client for testnet
        const client = Client.forTestnet();
        
        // Set the operator explicitly
        client.setOperator(myAccountId, privateKeyObject);
        client.setDefaultMaxTransactionFee(new Hbar(100));
        client.setMaxQueryPayment(new Hbar(50));
        
        console.log("Client configured successfully");

        // Create new account keypair
        const newAccountPrivateKey = PrivateKey.generateED25519();
        const newAccountPublicKey = newAccountPrivateKey.publicKey;
        
        console.log("Generated new account key pair");
        console.log("Creating new account with initial balance of 1000 tinybars");

        // Create a new account with initial balance
        const newAccountTx = await new AccountCreateTransaction()
            .setKey(newAccountPublicKey)
            .setInitialBalance(Hbar.fromTinybars(1000))
            .freezeWith(client)
            .sign(privateKeyObject); // Explicitly sign with the operator key

        const newAccountSubmit = await newAccountTx.execute(client);
        const getReceipt = await newAccountSubmit.getReceipt(client);
        const newAccountId = getReceipt.accountId;
        
        console.log("New account ID: " + newAccountId);

        // Define keys and IDs
        const treasuryId = myAccountId;
        const supplyKey = privateKeyObject;
        const associateId = newAccountId;
        const aliceKey = newAccountPrivateKey;
        const aliceId = newAccountId;

        // Create NFT
        const nftCreate = await new TokenCreateTransaction()
            .setTokenName("NFT_Collection")
            .setTokenSymbol("$PD")
            .setTokenType(TokenType.NonFungibleUnique)
            .setDecimals(0)
            .setInitialSupply(0)
            .setTreasuryAccountId(treasuryId)
            .setSupplyType(TokenSupplyType.Finite)
            .setMaxSupply(250)
            .setSupplyKey(supplyKey)
            .freezeWith(client);

        console.log(`SupplyKey configured\n`);

        const nftCreateTxSign = await nftCreate.sign(privateKeyObject);
        const nftCreateSubmit = await nftCreateTxSign.execute(client);
        const nftCreateRx = await nftCreateSubmit.getReceipt(client);
        const tokenId = nftCreateRx.tokenId;

        console.log(`Created NFT Collection with Token ID: ${tokenId}\n`);

        const maxTransactionFee = new Hbar(20);

        // Generate metadata links using your base CID
        const baseCID = "bafybeieqkgi7msf5oycamf5c4mh4uebis5f3at76lhsgnypxgippx76eu4";
        const metadataList = [];

        // Change this number to mint more NFTs
        const numberOfNFTs = 6;

        for (let i = 1; i <= numberOfNFTs; i++) {
            const metadata = Buffer.from(`ipfs://${baseCID}/NFT_${i}.png`);
            metadataList.push(metadata);
        }

        // Mint NFTs
        const mintTx = new TokenMintTransaction()
            .setTokenId(tokenId)
            .setMetadata(metadataList)
            .setMaxTransactionFee(maxTransactionFee)
            .freezeWith(client);

        const mintTxSign = await mintTx.sign(supplyKey);
        const mintTxSubmit = await mintTxSign.execute(client);
        const mintRx = await mintTxSubmit.getReceipt(client);

        console.log(`Minted ${numberOfNFTs} NFTs for Token ID ${tokenId}\n`);

        // Associate new account with the token
        const associateAccountTx = await new TokenAssociateTransaction()
            .setAccountId(associateId)
            .setTokenIds([tokenId])
            .freezeWith(client)
            .sign(aliceKey);

        const associateAccountSubmit = await associateAccountTx.execute(client);
        const associateAccountRx = await associateAccountSubmit.getReceipt(client);

        console.log(`NFT association with Alice's account: ${associateAccountRx.status}\n`);

        // Check balances
        let balanceCheckTx = await new AccountBalanceQuery().setAccountId(treasuryId).execute(client);
        console.log(`Treasury balance: ${balanceCheckTx.tokens._map.get(tokenId.toString())} NFTs of ID ${tokenId}`);

        balanceCheckTx = await new AccountBalanceQuery().setAccountId(aliceId).execute(client);
        console.log(`Alice's balance: ${balanceCheckTx.tokens._map.get(tokenId.toString())} NFTs of ID ${tokenId}`);

        // Transfer first NFT from treasury to Alice
        const tokenTransferTx = await new TransferTransaction()
            .addNftTransfer(tokenId, 1, treasuryId, newAccountId)
            .freezeWith(client)
            .sign(privateKeyObject);

        const tokenTransferSubmit = await tokenTransferTx.execute(client);
        const tokenTransferRx = await tokenTransferSubmit.getReceipt(client);

        console.log(`\nNFT #1 transfer from Treasury to Alice: ${tokenTransferRx.status}\n`);

        // Check balances again
        balanceCheckTx = await new AccountBalanceQuery().setAccountId(treasuryId).execute(client);
        console.log(`Treasury balance: ${balanceCheckTx.tokens._map.get(tokenId.toString())} NFTs of ID ${tokenId}`);

        balanceCheckTx = await new AccountBalanceQuery().setAccountId(aliceId).execute(client);
        console.log(`Alice's balance: ${balanceCheckTx.tokens._map.get(tokenId.toString())} NFTs of ID ${tokenId}`);
    } catch (error) {
        console.error("Error in NFT creation process:");
        console.error(error);
        
        if (error.message && error.message.includes("INVALID_SIGNATURE")) {
            console.error("\nINVALID_SIGNATURE suggests your private key doesn't match your account ID.");
            console.error("1. Check that your MY_ACCOUNT_ID in .env is correct");
            console.error("2. Make sure MY_PRIVATE_KEY is the correct key for that account");
            console.error("3. Verify you have sufficient HBAR balance for this transaction");
        }
    }
}

environmentSetup();