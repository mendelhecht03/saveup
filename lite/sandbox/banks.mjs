// The SaveUp test bank: a Plaid Sandbox custom user ("user_custom") built from code.
// Everything is a pure function of today's date so the history always ends today and
// pending charges always have a posted date in the future (that is the only way Sandbox
// makes a transaction pending; /sandbox/transactions/create cannot).
//
// Each entry: account, day it happened (days from today, negative = past), optional
// `posts` (days from today it posts; > 0 keeps it pending), amountCents (positive =
// money out, Plaid's convention) and the bank description.
//
// Sandbox cannot produce, so logic tests in tests/sandbox.test.mjs cover instead:
//  * a pending amount that changes when it posts (the gas hold posting at the real fill-up),
//  * a pending charge that drops off without posting,
//  * the same transaction delivered twice.
// Whether Sandbox later flips these pending charges to posted once `posts` passes is up
// to Plaid; the app's pending→posted rules are tested in logic.test.mjs either way.
import { addDays } from '../public/logic.mjs';
import { RECEIPTS, CARD_LAST4 } from './receipts.mjs';

export const BANK_NAME = 'SaveUp Test Bank';
export const INSTITUTION_ID = 'ins_109508'; // First Platypus Bank, non-OAuth (custom users need that)

export const ACCOUNTS = {
  checking: { type: 'depository', subtype: 'checking', starting_balance: 2450, meta: { name: 'Everyday Checking', mask: CARD_LAST4.checking } },
  savings: { type: 'depository', subtype: 'savings', starting_balance: 8000, meta: { name: 'High-Yield Savings', mask: '5542', apy: 4.1 } },
  card: { type: 'credit', subtype: 'credit card', starting_balance: 412.35, meta: { name: 'Rewards Card', mask: CARD_LAST4.card, limit: 5000 } }
};

const t = (key, account, day, amountCents, description, posts) => ({ key, account, day, amountCents, description, ...(posts == null ? {} : { posts }) });
const receiptTotal = id => RECEIPTS.find(r => r.id === id).totalCents;
const monthly = (key, account, days, amountCents, description) => days.map((d, i) => t(`${key}${i + 1}`, account, d, amountCents, description));

export const SCENARIOS = {
  // Kahan's $2.53 twice: confirm the first, and the second should arrive with a suggestion.
  everyday: [
    t('kahans1', 'checking', -9, 253, "KAHAN'S"),
    t('kahans2', 'checking', -2, 253, "KAHAN'S"),
    t('starbucks', 'card', -1, 645, 'STARBUCKS STORE 08812'),
    t('traderJoes', 'card', -6, 5412, "TRADER JOE'S #602"),
    t('chipotle', 'card', -8, 1385, 'CHIPOTLE 2291'),
    t('cvs', 'checking', -10, 927, 'CVS/PHARMACY #04411'),
    t('uber', 'card', -13, 1840, 'UBER *TRIP'),
    t('shellPosted', 'checking', -15, 4218, 'SHELL OIL 57442'),
    t('dunkin', 'card', -19, 487, 'DUNKIN #351207'),
    t('wholeFoods', 'card', -23, 7633, 'WHOLE FOODS MKT #10452'),
    t('pizza', 'card', -29, 2650, 'PIZZA CITY TEANECK')
  ],
  pending: [
    t('bestBuyPending', 'card', -1, receiptTotal('best-buy-pending'), 'BEST BUY 00010629', 2),
    t('gasHold', 'checking', 0, 10000, 'SHELL OIL 57442 PRE-AUTH', 3),
    t('restaurantPending', 'card', -1, 6420, 'OLIVE GARDEN #1782', 1)
  ],
  refunds: [
    t('oldNavy', 'card', -20, 3999, 'OLD NAVY #5531'),
    t('oldNavyRefund', 'card', -16, -3999, 'OLD NAVY #5531 RETURN'),
    t('amazon', 'card', -25, 8640, 'AMAZON MKTPL*2K4L19'),
    t('amazonPartialRefund', 'card', -18, -2499, 'AMAZON MKTPL REFUND')
  ],
  transfers: [
    t('zelleOut', 'checking', -12, 6000, 'ZELLE PAYMENT TO JOSH LEVY'),
    t('paypal', 'checking', -22, 3500, 'PAYPAL TRANSFER'),
    t('venmoOut', 'checking', -8, 2250, 'VENMO PAYMENT'),
    t('venmoIn', 'checking', -17, -3000, 'VENMO CASHOUT'),
    t('toSavings', 'checking', -27, 50000, 'ONLINE TRANSFER TO SAVINGS XXXX5542'),
    t('fromChecking', 'savings', -27, -50000, 'ONLINE TRANSFER FROM CHECKING XXXX0721'),
    t('cardPayment', 'checking', -21, 64000, 'ONLINE TRANSFER TO CREDIT CARD XXXX4417'),
    // Real card statements word it like this. Plaid tags both sides LOAN_PAYMENTS, so the
    // card side is not yet recognised as a transfer by logic.mjs (milestone 4).
    t('cardPaymentReceived', 'card', -21, -64000, 'PAYMENT RECEIVED - THANK YOU')
  ],
  // For the future IOU screens: a friend paying back their share of dinner.
  friendPayback: [t('friendPayback', 'checking', -5, -4500, 'ZELLE PAYMENT FROM DAVID COHEN')],
  subscriptions: [
    ...monthly('spotify', 'card', [-62, -32, -2], 1199, 'SPOTIFY USA'),
    t('primeAnnual', 'card', -40, 13900, 'AMAZON PRIME*ANNUAL'),
    // Price increase: $15.49 → $17.99 on the latest charge.
    ...monthly('netflix', 'card', [-75, -45], 1549, 'NETFLIX.COM'),
    t('netflix3', 'card', -15, 1799, 'NETFLIX.COM'),
    // Stopped: two monthly charges, then nothing for over a month.
    ...monthly('gym', 'checking', [-84, -54], 2499, 'PLANET FITNESS CLUB FEES')
  ],
  atm: [t('atm', 'checking', -6, 10000, 'ATM WITHDRAWAL 1234 MAIN ST TEANECK')],
  payroll: [-80, -66, -52, -38, -24, -10].map((d, i) => t(`payroll${i + 1}`, 'checking', d, -185000, 'NORTHWIND LABS PAYROLL PPD')),
  // Exact receipt matches, one $5.00 off, and one with no receipt at all.
  receipts: [
    t('targetSplit', 'card', -4, receiptTotal('target-split'), 'TARGET 00018473'),
    t('homeDepot', 'card', -11, receiptTotal('home-depot'), 'THE HOME DEPOT #0912'),
    t('shopriteOff', 'checking', -3, receiptTotal('shoprite-off') - 500, 'SHOPRITE TEANECK S1'),
    t('noReceipt', 'card', -7, 3847, 'BARNES & NOBLE #2741')
  ],
  interest: [t('interest', 'savings', -3, -2733, 'INTEREST PAYMENT')]
};

export const allTransactions = () => Object.values(SCENARIOS).flat();

// The JSON that goes in override_password for override_username "user_custom".
export function customUser(today) {
  const txns = allTransactions();
  return {
    override_accounts: Object.entries(ACCOUNTS).map(([name, account]) => ({
      ...account, currency: 'USD',
      transactions: txns.filter(x => x.account === name).map(x => ({
        date_transacted: addDays(today, x.day), date_posted: addDays(today, x.posts ?? x.day),
        amount: x.amountCents / 100, description: x.description, currency: 'USD'
      }))
    }))
  };
}

export const publicTokenRequest = today => ({
  institution_id: INSTITUTION_ID, initial_products: ['transactions'],
  options: { override_username: 'user_custom', override_password: JSON.stringify(customUser(today)) }
});
