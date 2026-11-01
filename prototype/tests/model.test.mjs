import test from 'node:test';
import assert from 'node:assert/strict';
import { fresh,summarize,confirmReview,postPending,ioUs } from '../dist/model.js';

test('initial week includes unexplained transfers but excludes them from income and spending',()=>{
  const s=summarize(fresh());
  assert.deepEqual([s.total,s.reviewed,s.unclassified,s.unclassifiedAmount,s.income,s.spent],[8,2,2,16000,0,840]);
});
test('an explicit transfer decision is required, even when the bank posted it',()=>{
  const s=fresh();
  assert.throws(()=>confirmReview(s,'zelle',{category:'Essentials'}),/Choose what this transfer/);
  confirmReview(s,'zelle',{classification:'income'});
  confirmReview(s,'savings',{classification:'own'});
  const totals=summarize(s);
  assert.deepEqual([totals.unclassified,totals.income,totals.spent],[0,6000,840]);
});
test('expense transfers require a category, and outgoing money cannot become income',()=>{
  const s=fresh();
  assert.throws(()=>confirmReview(s,'savings',{classification:'expense'}),/Choose a budget/);
  assert.throws(()=>confirmReview(s,'savings',{classification:'income'}),/outgoing/);
  assert.throws(()=>confirmReview(s,'zelle',{classification:'expense',category:'Essentials'}),/Incoming/);
  confirmReview(s,'savings',{classification:'expense',category:'Housing'});
  assert.equal(summarize(s).spent,10840);
});
test('a pending charge becomes posted once, keeping the review when the amount is unchanged',()=>{
  const s=fresh();confirmReview(s,'groceries',{category:'Essentials'});
  assert.equal(summarize(s).pending,4872);
  postPending(s,'groceries',4872);
  const r=summarize(s);
  assert.deepEqual([r.pending,r.posted,r.reviewed,s.transactions.length],[0,5712,3,8]);
});
test('a changed posted amount asks for review again and replaces the old pending amount',()=>{
  const s=fresh();confirmReview(s,'groceries',{category:'Essentials'});postPending(s,'groceries',5072);
  assert.equal(summarize(s).spent,840);
  assert.equal(s.transactions.find(t=>t.id==='groceries').reviewed,false);
  confirmReview(s,'groceries',{category:'Essentials'});
  assert.equal(summarize(s).spent,5912);
  assert.equal(s.transactions.find(t=>t.id==='groceries').changed,false);
});
test('receipt splits reconcile exactly and preserve the original outflow while separating an IOU',()=>{
  const s=fresh();const t=s.transactions.find(t=>t.id==='target');const lines=structuredClone(t.lines);
  lines[1].person='Jamie';
  confirmReview(s,t.id,{split:true,lines});
  assert.equal(summarize(s).spent,3039);
  assert.equal(summarize(s).iou,449);
  assert.equal(t.amount,2648);
  assert.equal(ioUs(s)[0].person,'Jamie');
  lines[0].amount=1200;
  assert.throws(()=>confirmReview(s,t.id,{split:true,lines}),/add up/);
  assert.equal(t.lines[0].amount,1299);
});
test('matching a planned purchase releases the reservation and does not duplicate the charge',()=>{
  const s=fresh();confirmReview(s,'coat',{category:'Essentials',matchPlan:true});
  assert.equal(summarize(s).reserved,0);
  assert.equal(summarize(s).spent,12830);
  assert.equal(s.transactions.length,8);
  confirmReview(s,'coat',{category:'Essentials',matchPlan:false});
  assert.equal(summarize(s).reserved,12500);
});
test('concepts can have independent copies of the same mock week',()=>{
  const a=fresh(),b=fresh();confirmReview(a,'kahan',{category:'Essentials'});
  assert.equal(summarize(a).reviewed,3);assert.equal(summarize(b).reviewed,2);
});
test('date filters include boundaries and preserve underlying transactions',()=>{
  const s=fresh();s.range={start:'2026-10-30',end:'2026-10-31'};
  assert.equal(summarize(s).total,4);assert.equal(s.transactions.length,8);
});
test('budgets retain amounts above the limit instead of capping actual use',()=>{
  const s=fresh();confirmReview(s,'coat',{category:'Essentials'});confirmReview(s,'groceries',{category:'Essentials'});
  const c=summarize(s).categories.Essentials;
  assert.equal(c.posted+c.pending,16862);
  assert.ok((c.posted+c.pending)/15000>1);
});
