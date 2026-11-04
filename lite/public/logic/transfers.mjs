// Which bank lines are transfers, and the merchant key used to remember choices.
// ---- classification
// Card payments show up twice: leaving checking and arriving on the card
// ("PAYMENT RECEIVED - THANK YOU"). Both sides are transfers between your own
// accounts, so neither counts as income or spending until you say so.
const TRANSFER_WORDS = /\b(zelle|venmo|paypal|cash ?app|transfer|xfer|wire|autopay|payment received|payment thank you|card payment)\b/i;
export const looksLikeTransfer = (name, pfc) => /^(TRANSFER_(IN|OUT)|LOAN_PAYMENTS)$/.test(pfc || '') || TRANSFER_WORDS.test(name || '');
export const merchantKey = name => String(name || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
