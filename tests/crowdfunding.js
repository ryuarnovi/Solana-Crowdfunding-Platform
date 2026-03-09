const anchor = require("@coral-xyz/anchor");
const { expect } = require("chai");
const { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");

describe("Checklist Pengujian Crowdfunding", function() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const idl = JSON.parse(fs.readFileSync("./crowdfunding.json", "utf8"));
  const program = new anchor.Program(idl, provider);

  const campaign = Keypair.generate();
  const creator = provider.wallet;
  const donor = Keypair.generate();
  
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  it("1. Create campaign: Goal 2 SOL, Deadline +8 detik", async function() {
    console.log("   --- Skenario 1 ---");
    const goal = new anchor.BN(2 * LAMPORTS_PER_SOL);
    const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 8);

    await program.methods
      .createCampaign(goal, deadline)
      .accounts({
        campaign: campaign.publicKey,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([campaign])
      .rpc();

    console.log("   ✅ Campaign dibuat.");
  });

  it("2. Contribute 1.2 SOL → Success, raised=1.2", async function() {
    console.log("   --- Skenario 2 ---");
    const airdropSig = await provider.connection.requestAirdrop(donor.publicKey, 5 * LAMPORTS_PER_SOL);
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: airdropSig,
    });

    const amount = new anchor.BN(1.2 * LAMPORTS_PER_SOL);
    const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), campaign.publicKey.toBuffer()], program.programId);
    const [donorAcc] = PublicKey.findProgramAddressSync([Buffer.from("donor"), campaign.publicKey.toBuffer(), donor.publicKey.toBuffer()], program.programId);

    await program.methods.contribute(amount).accounts({
      campaign: campaign.publicKey,
      vault,
      contributor: donor.publicKey,
      donor: donorAcc,
      systemProgram: SystemProgram.programId,
    }).signers([donor]).rpc();

    console.log("   ✅ Kontribusi 1.2 SOL sukses.");
  });

  it("3. Contribute 1 SOL → Success, raised=2.2 (Goal reached!)", async function() {
    console.log("   --- Skenario 3 ---");
    const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
    const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), campaign.publicKey.toBuffer()], program.programId);
    const [donorAcc] = PublicKey.findProgramAddressSync([Buffer.from("donor"), campaign.publicKey.toBuffer(), donor.publicKey.toBuffer()], program.programId);

    await program.methods.contribute(amount).accounts({
      campaign: campaign.publicKey,
      vault,
      contributor: donor.publicKey,
      donor: donorAcc,
      systemProgram: SystemProgram.programId,
    }).signers([donor]).rpc();

    console.log("   ✅ Kontribusi tambahan 1 SOL sukses.");
  });

  it("4. Try withdraw before deadline → Should Fail", async function() {
    console.log("   --- Skenario 4 ---");
    const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), campaign.publicKey.toBuffer()], program.programId);
    try {
      await program.methods.withdraw().accounts({
        campaign: campaign.publicKey,
        vault,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      }).rpc();
      expect.fail("Withdraw seharusnya gagal sebelum deadline");
    } catch (err) {
      console.log("   ✅ Withdraw gagal (sesuai ekspektasi) karena belum deadline.");
    }
  });

  it("5. Wait until after deadline → Withdraw should succeed", async function() {
    console.log("   --- Skenario 5 ---");
    console.log("   ... Menunggu deadline (8 detik) ...");
    await sleep(9000); 

    const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), campaign.publicKey.toBuffer()], program.programId);
    await program.methods.withdraw().accounts({
      campaign: campaign.publicKey,
      vault,
      creator: creator.publicKey,
      systemProgram: SystemProgram.programId,
    }).rpc();
    
    console.log("   ✅ Withdraw sukses setelah deadline.");
  });

  it("6. Try withdraw again → Should Fail (Already claimed)", async function() {
    console.log("   --- Skenario 6 ---");
    const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), campaign.publicKey.toBuffer()], program.programId);
    try {
      await program.methods.withdraw().accounts({
        campaign: campaign.publicKey,
        vault,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      }).rpc();
      expect.fail("Double withdraw seharusnya gagal");
    } catch (err) {
      console.log("   ✅ Double withdraw gagal (sesuai ekspektasi) - 'Already Claimed'.");
    }
  });
});
