// Prototype ledger. Keep money in integer cents so split amounts reconcile exactly.
export const CATEGORIES = ['Essentials','Recreation','Travel','Personal Care','Housing','Education'];
export const LIMITS = { Essentials:15000, Recreation:6000, Travel:4000, 'Personal Care':5000, Housing:14000, Education:6000 };
export const fresh = () => ({
  transactions:[
    { id:'kahan', name:"Kahan’s", amount:253, date:'2026-10-31', kind:'purchase', status:'posted', account:'Everyday card · 4821', icon:'bag', tone:'blue', suggestion:'Essentials', hint:'Toothbrush?', description:'', reviewed:false },
    { id:'groceries', name:'Trader Joe’s', amount:4872, date:'2026-10-31', kind:'purchase', status:'pending', account:'Everyday card · 4821', icon:'basket', tone:'green', suggestion:'Essentials', hint:'Weekly groceries', reviewed:false },
    { id:'zelle', name:'Zelle from Jamie', amount:6000, direction:'in', date:'2026-10-30', kind:'transfer', status:'posted', account:'Checking · 1904', icon:'arrows', tone:'lavender', hint:'What was this for?', reviewed:false },
    { id:'target', name:'Target', amount:2648, date:'2026-10-30', kind:'purchase', status:'posted', account:'Everyday card · 4821', icon:'receipt', tone:'pink', suggestion:'Personal Care', hint:'3 receipt items · split or IOU', receipt:true, reviewed:false, lines:[
      { name:'Shampoo', amount:1299, category:'Personal Care', person:'' },
      { name:'Chocolate bar', amount:449, category:'Recreation', person:'' },
      { name:'Kitchen towels', amount:900, category:'Essentials', person:'' }
    ] },
    { id:'coat', name:'UNIQLO', amount:11990, date:'2026-10-29', kind:'purchase', status:'posted', account:'Everyday card · 4821', icon:'coat', tone:'peach', suggestion:'Essentials', hint:'Possible match · Winter coat', planId:'winter-coat', reviewed:false },
    { id:'savings', name:'Transfer to savings', amount:10000, direction:'out', date:'2026-10-28', kind:'transfer', status:'posted', account:'Checking · 1904', icon:'arrows', tone:'lavender', hint:'Confirm where it belongs', reviewed:false },
    { id:'cafe', name:'Corner café', amount:550, date:'2026-10-27', kind:'purchase', status:'posted', account:'Everyday card · 4821', icon:'cup', tone:'peach', category:'Recreation', description:'Coffee', reviewed:true },
    { id:'train', name:'Subway', amount:290, date:'2026-10-26', kind:'purchase', status:'posted', account:'Everyday card · 4821', icon:'train', tone:'blue', category:'Travel', description:'Ride home', reviewed:true }
  ],
  plans:[{id:'winter-coat', name:'Winter coat', category:'Essentials', low:10000, high:15000, reserve:12500, saved:7500, merchant:'UNIQLO', date:'2026-10-29', essential:true, matchedTransaction:null}],
  range:{start:'2026-10-25',end:'2026-10-31'}, feedback:{rating:'',note:''}
});
export const inRange = (state) => state.transactions.filter(t => t.date >= state.range.start && t.date <= state.range.end);
export function summarize(state) {
  const tx = inRange(state);
  const result = {total:tx.length,reviewed:0,posted:0,pending:0,cash:0,income:0,unclassified:0,unclassifiedAmount:0,iou:0,reserved:0,categories:Object.fromEntries(CATEGORIES.map(c=>[c,{posted:0,pending:0,cash:0}]))};
  for (const t of tx) {
    if (t.reviewed) result.reviewed++;
    if (t.kind==='transfer' && !t.reviewed) { result.unclassified++; result.unclassifiedAmount+=t.amount; }
    if (!t.reviewed) continue;
    if (t.classification==='income') result.income+=t.amount;
    if (t.kind==='transfer' && t.classification!=='expense') continue;
    const bucket=t.status==='pending'?'pending':t.status==='cash'?'cash':'posted';
    const lines=t.split?t.lines:[{amount:t.amount,category:t.category}];
    for (const l of lines) {
      if (l.person) { result.iou+=l.amount; continue; }
      if (result.categories[l.category]) { result.categories[l.category][bucket]+=l.amount; result[bucket]+=l.amount; }
    }
  }
  result.reserved=state.plans.filter(p=>!p.matchedTransaction).reduce((n,p)=>n+p.reserve,0);
  result.spent=result.posted+result.pending+result.cash;
  result.remaining=50000-result.spent-result.reserved;
  return result;
}
export function validateReview(t, draft) {
  if (t.kind==='transfer' && !['own','income','expense'].includes(draft.classification)) return 'Choose what this transfer means before confirming.';
  if (t.kind==='transfer' && t.direction==='out' && draft.classification==='income') return 'An outgoing transfer cannot be classified as income.';
  if (t.kind==='transfer' && t.direction==='in' && draft.classification==='expense') return 'Incoming money cannot be classified as a new expense.';
  if (t.kind==='purchase' || draft.classification==='expense') {
    if (draft.split) {
      if (!draft.lines?.length || draft.lines.some(l=>!l.name.trim() || !Number.isSafeInteger(l.amount) || l.amount<=0 || (!l.person && !CATEGORIES.includes(l.category)))) return 'Give each item a name, a positive amount, and a category or IOU person.';
      if (draft.lines.reduce((n,l)=>n+l.amount,0)!==t.amount) return 'The split must add up to the original transaction amount.';
    } else if (!CATEGORIES.includes(draft.category)) return 'Choose a budget category.';
  }
  return '';
}
export function confirmReview(state,id,draft) {
  const t=state.transactions.find(t=>t.id===id);
  if (!t) throw new Error('Transaction not found.');
  const error=validateReview(t,draft);
  if (error) throw new Error(error);
  const plan=t.planId && state.plans.find(p=>p.id===t.planId);
  if (draft.matchPlan && (!plan || (plan.matchedTransaction && plan.matchedTransaction!==t.id))) throw new Error('This plan is no longer available to match.');
  Object.assign(t,{category:draft.category||'',description:draft.description||'',note:draft.note||'',priority:draft.priority||3,classification:draft.classification||'',split:!!draft.split,reviewed:true,changed:false});
  if (draft.split) t.lines=structuredClone(draft.lines);
  if (plan) { if (draft.matchPlan) plan.matchedTransaction=t.id; else if (plan.matchedTransaction===t.id) plan.matchedTransaction=null; }
  return t;
}
export function postPending(state,id,amount) {
  const t=state.transactions.find(t=>t.id===id);
  if (!t || t.status!=='pending' || !Number.isSafeInteger(amount) || amount<=0) throw new Error('Choose a valid pending transaction and posted amount.');
  const changed=t.amount!==amount;
  t.status='posted';t.amount=amount;
  if (changed) {t.reviewed=false;t.changed=true;}
  return changed;
}
export function ioUs(state) {
  return state.transactions.filter(t=>t.reviewed && t.split).flatMap(t=>t.lines.filter(l=>l.person).map(l=>({...l,transaction:t.name,id:t.id})));
}
