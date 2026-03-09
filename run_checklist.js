const anchor = require("@coral-xyz/anchor");
const { expect } = require("chai");
const { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");

async function runTest() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const idl = JSON.parse(fs.readFileSync("./crowdfunding.json", "utf8"));
  const program = new anchor.Program(idl, provider);

  const campaign = Keypair.generate();
  const creator = provider.wallet;
  const donor = Keypair.generate();
  
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  console.log("\n--- Memulai Checklist Pengujian ---");

  // 1. Create Campaign
  console.log("1. Creating campaign (Goal: 2 SOL, Deadline: +8s)...");
  const goal = new anchor.BN(2 * LAMPORTS_PER_SOL);
  const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 8);

  await program.methods
    .createCampaign(goal, deadline)
    .accounts({
      campaign: campaign.publicKey,
      creator: creator.publicKey,
      
    })
    .signers([campaign])
    .rpc();
  console.log("   ✅ Success.");

  // 2. Contribute 1.2
  console.log("2. Contributing 1.2 SOL...");
  const airdropSig = await provider.connection.requestAirdrop(donor.publicKey, 5 * LAMPORTS_PER_SOL);
  const latestBlockHash = await provider.connection.getLatestBlockhash();
  await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSig,
  });

  const amount1 = new anchor.BN(1.2 * LAMPORTS_PER_SOL);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), campaign.publicKey.toBuffer()], program.programId);
  const [donorAcc] = PublicKey.findProgramAddressSync([Buffer.from("donor"), campaign.publicKey.toBuffer(), donor.publicKey.toBuffer()], program.programId);

  await program.methods.contribute(amount1).accounts({
    campaign: campaign.publicKey,
    vault,
    contributor: donor.publicKey,
    donor: donorAcc,
    
  }).signers([donor]).rpc();
  console.log("   ✅ Success.");

  // 3. Contribute 1.0
  console.log("3. Contributing 1.0 SOL (Total raised: 2.2 SOL)...");
  const amount2 = new anchor.BN(1 * LAMPORTS_PER_SOL);
  await program.methods.contribute(amount2).accounts({
    campaign: campaign.publicKey,
    vault,
    contributor: donor.publicKey,
    donor: donorAcc,
    
  }).signers([donor]).rpc();
  console.log("   ✅ Success.");

  // 4. Try withdraw before
  console.log("4. Trying withdraw before deadline (Expect fail)...");
  try {
    await program.methods.withdraw().accounts({
      campaign: campaign.publicKey,
      vault,
      creator: creator.publicKey,
      
    }).rpc();
    throw new Error("Withdraw should have failed");
  } catch (err) {
    console.log("   ✅ Withdraw failed as expected.");
  }

  // 5. Wait and Withdraw
  console.log("5. Waiting for deadline (8s)...");
  await sleep(9000);
  console.log("   Withdrawing...");
  
  // Ambil saldo awal creator
  const balanceBefore = await provider.connection.getBalance(creator.publicKey);

  await program.methods.withdraw().accounts({
    campaign: campaign.publicKey,
    vault,
    creator: creator.publicKey,
    
  }).rpc();
  
  // Periksa saldo akhir
  const balanceAfter = await provider.connection.getBalance(creator.publicKey);
  console.log("   Saldo Creator bertambah sekitar:", (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL, "SOL");
  console.log("   ✅ Success.");

  // 6. Double Withdraw
  console.log("6. Trying double withdraw (Expect fail)...");
  try {
    await program.methods.withdraw().accounts({
      campaign: campaign.publicKey,
      vault,
      creator: creator.publicKey,
      
    }).rpc();
    throw new Error("Double withdraw should have failed");
  } catch (err) {
    console.log("   ✅ Double withdraw failed as expected.");
  }

  console.log("\n--- SEMUA PENGUJIAN LULUS! ---\n");
}

runTest().catch(console.error);
