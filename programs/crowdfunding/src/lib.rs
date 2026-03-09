use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    program::{invoke, invoke_signed},
    system_instruction,
};

declare_id!("7KUPLcHBAA5rGoq7LawQWBkCBGNgiaUoqsVsvKrtZyzJ");

#[program]
pub mod crowdfunding {
    use super::*;

    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        goal: u64,
        deadline: i64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        require!(deadline > clock.unix_timestamp, ErrorCode::DeadlineTooSoon);

        let campaign = &mut ctx.accounts.campaign;
        campaign.creator = ctx.accounts.creator.key();
        campaign.goal = goal;
        campaign.raised = 0;
        campaign.deadline = deadline;
        campaign.claimed = false;
        msg!("Campaign created: goal={}, deadline={}", goal, deadline);
        Ok(())
    }

    pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
        let clock = Clock::get()?;
        let campaign_key = ctx.accounts.campaign.key();
        let campaign = &mut ctx.accounts.campaign;

        require!(clock.unix_timestamp < campaign.deadline, ErrorCode::CampaignEnded);
        require!(!campaign.claimed, ErrorCode::AlreadyClaimed);

        // Transfer lamports from contributor to vault PDA
        invoke(
            &system_instruction::transfer(
                ctx.accounts.contributor.key,
                ctx.accounts.vault.key,
                amount,
            ),
            &[
                ctx.accounts.contributor.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Update donor account tracking
        let donor_acct = &mut ctx.accounts.donor;
        donor_acct.campaign = campaign_key;
        donor_acct.donor = ctx.accounts.contributor.key();
        donor_acct.amount += amount;

        // Update campaign raised amount
        campaign.raised += amount;
        msg!("Contributed: {} lamports, total={}", amount, campaign.raised);
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let clock = Clock::get()?;
        let campaign = &mut ctx.accounts.campaign;

        require!(campaign.raised >= campaign.goal, ErrorCode::GoalNotReached);
        require!(clock.unix_timestamp >= campaign.deadline, ErrorCode::DeadlineNotReached);
        require!(!campaign.claimed, ErrorCode::AlreadyClaimed);
        require!(ctx.accounts.creator.key() == campaign.creator, ErrorCode::NotCreator);

        // Transfer all lamports from vault PDA to creator
        let vault_info = ctx.accounts.vault.to_account_info();
        let creator_info = ctx.accounts.creator.to_account_info();
        
        let vault_lamports = vault_info.lamports();
        
        **vault_info.lamports.borrow_mut() = 0;
        **creator_info.lamports.borrow_mut() += vault_lamports;
        
        campaign.claimed = true;
        msg!("Withdrawn: {} lamports", vault_lamports);

        Ok(())
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let clock = Clock::get()?;
        let campaign = &mut ctx.accounts.campaign;

        require!(clock.unix_timestamp >= campaign.deadline, ErrorCode::DeadlineNotReached);
        require!(campaign.raised < campaign.goal, ErrorCode::GoalReached);

        let donor_acct = &mut ctx.accounts.donor;
        let refund_amount = donor_acct.amount;
        require!(refund_amount > 0, ErrorCode::AlreadyRefunded);

        let campaign_key = ctx.accounts.campaign.key();
        let vault_bump = *ctx.bumps.get("vault").unwrap();
        let seeds = &[
            b"vault",
            campaign_key.as_ref(),
            &[vault_bump]
        ];

        // Transfer lamports from vault PDA back to donor
        invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.vault.key,
                ctx.accounts.donor_account.key,
                refund_amount,
            ),
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.donor_account.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[seeds],
        )?;

        // Zero the donor's contribution so no double refund
        donor_acct.amount = 0;
        msg!("Refunded: {} lamports", refund_amount);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateCampaign<'info> {
    #[account(init, payer = creator, space = 8 + Campaign::SIZE)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        seeds = [b"vault", campaign.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub contributor: Signer<'info>,
    #[account(
        init_if_needed,
        payer = contributor,
        space = 8 + Donor::SIZE,
        seeds = [b"donor", campaign.key().as_ref(), contributor.key().as_ref()],
        bump,
    )]
    pub donor: Account<'info, Donor>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, has_one = creator)]
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        seeds = [b"vault", campaign.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        seeds = [b"vault", campaign.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"donor", campaign.key().as_ref(), donor_account.key().as_ref()],
        bump,
    )]
    pub donor: Account<'info, Donor>,
    #[account(mut)]
    pub donor_account: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Campaign {
    pub creator: Pubkey,
    pub goal: u64,
    pub raised: u64,
    pub deadline: i64,
    pub claimed: bool,
}
impl Campaign {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct Donor {
    pub campaign: Pubkey,
    pub donor: Pubkey,
    pub amount: u64,
}
impl Donor {
    pub const SIZE: usize = 32 + 32 + 8;
}

#[error_code]
pub enum ErrorCode {
    #[msg("Campaign deadline must be in the future")]
    DeadlineTooSoon,
    #[msg("Campaign has ended")]
    CampaignEnded,
    #[msg("Funds already claimed")]
    AlreadyClaimed,
    #[msg("Campaign goal not reached")]
    GoalNotReached,
    #[msg("Deadline not reached")]
    DeadlineNotReached,
    #[msg("Not campaign creator")]
    NotCreator,
    #[msg("Campaign goal has been reached for refund")]
    GoalReached,
    #[msg("Already refunded")]
    AlreadyRefunded,
}
