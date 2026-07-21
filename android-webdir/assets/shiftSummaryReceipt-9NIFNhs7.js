const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/escpos-ble-C4ISUr-g.js","assets/chunk-QTnfLwEv.js","assets/preload-helper-zJ_50EbN.js"])))=>i.map(i=>d[i]);
import{t as e}from"./preload-helper-zJ_50EbN.js";import{n as t,r as n}from"./index-CEwyuZMU.js";var r=e=>`$${Number(e||0).toFixed(2)}`,i=new TextEncoder;function a(e){return e===`80`?42:32}function o(e){return`-`.repeat(e)}function s(e,t,n){let r=Math.max(1,n-e.length-t.length);return e+` `.repeat(r)+t}function c(e){let t=e.reduce((e,t)=>e+t.length,0),n=new Uint8Array(t),r=0;for(let t of e)n.set(t,r),r+=t.length;return n}async function l(l){let u=a(typeof window<`u`&&window.localStorage.getItem(`pos.receipt.paperWidth`)||`58`),d=n,f=[];f.push(d.init(),d.align(`center`),d.bold(!0),i.encode(`REGISTER SHIFT SUMMARY
`),d.bold(!1)),f.push(i.encode(`${l.store?.name??``}\n${new Date().toLocaleString()}\n`)),f.push(d.align(`left`),i.encode(o(u)+`
`)),f.push(i.encode(s(`Shift`,l.session.id.slice(0,8),u)+`
`)),f.push(i.encode(s(`Employee`,(l.cashier?.full_name??`—`).slice(0,u-10),u)+`
`)),f.push(i.encode(s(`Register`,(l.terminal?.label??`Default`).slice(0,u-10),u)+`
`)),f.push(i.encode(s(`Opened`,new Date(l.session.opened_at).toLocaleTimeString(),u)+`
`)),f.push(i.encode(s(`Closed`,l.session.closed_at?new Date(l.session.closed_at).toLocaleTimeString():`—`,u)+`
`)),f.push(i.encode(o(u)+`
`)),f.push(d.bold(!0),i.encode(`Sales
`),d.bold(!1)),f.push(i.encode(s(`Transactions`,String(l.salesSummary.totalTx),u)+`
`)),f.push(i.encode(s(`Gross`,r(l.salesSummary.grossSales),u)+`
`)),f.push(i.encode(s(`Discounts`,r(l.salesSummary.totalDiscount),u)+`
`)),f.push(i.encode(s(`Tax`,r(l.salesSummary.totalTax),u)+`
`)),f.push(i.encode(s(`Net`,r(l.salesSummary.netSales),u)+`
`)),f.push(i.encode(o(u)+`
`)),f.push(d.bold(!0),i.encode(`Payments
`),d.bold(!1));for(let[e,t]of Object.entries(l.paymentSummary.byMethod))f.push(i.encode(s(e,r(t),u)+`
`));if(f.push(i.encode(s(`Grand total`,r(l.paymentSummary.grandTotal),u)+`
`)),f.push(i.encode(o(u)+`
`)),f.push(d.bold(!0),i.encode(`Cash reconciliation
`),d.bold(!1)),f.push(i.encode(s(`Opening`,r(l.session.opening_cash??0),u)+`
`)),f.push(i.encode(s(`Cash sales`,r(l.session.cash_sales??0),u)+`
`)),f.push(i.encode(s(`Refunds`,`-${r(l.session.cash_refunds??0)}`,u)+`
`)),f.push(i.encode(s(`Safe drops`,`-${r(l.safeDropTotal)}`,u)+`
`)),f.push(i.encode(s(`Expected`,r(l.session.expected_cash??0),u)+`
`)),f.push(i.encode(s(`Counted`,l.session.closing_cash==null?`—`:r(l.session.closing_cash),u)+`
`)),l.session.closing_cash!=null){let e=Number(l.session.closing_cash)-Number(l.session.expected_cash??0);f.push(i.encode(s(`Over/short`,(e>0?`+`:``)+r(e),u)+`
`))}f.push(i.encode(o(u)+`
`)),f.push(d.align(`center`),i.encode(`SEZA POS


`),d.cut());let p=t();if(p.id===`none`||!await p.isReady())return{ok:!1,error:`Printer is not configured.`};try{return await(await e(()=>import(`./escpos-ble-C4ISUr-g.js`).then(e=>e.t),__vite__mapDeps([0,1,2]))).write(c(f)),{ok:!0}}catch(e){return{ok:!1,error:e instanceof Error?e.message:`Printer error`}}}export{l as printShiftSummary};