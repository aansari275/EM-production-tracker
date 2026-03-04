import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/Users/abdul/Documents/Eastern Mills/FORMS/easternmillscom-0907945d2d73.json'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection('orders').doc('data').collection('orders').get();
const bad = snap.docs.filter(d => {
  const s = d.data().salesNo || '';
  return s && !s.startsWith('EM-');
});

for (const doc of bad) {
  const data = doc.data();
  console.log(`Doc: ${doc.id} | salesNo: ${data.salesNo} | buyer: ${data.buyerName} | company: ${data.companyCode}`);
  const fixed = 'EM-' + data.salesNo;
  console.log(`  → Fixing to: ${fixed}`);
  await db.collection('orders').doc('data').collection('orders').doc(doc.id).update({ salesNo: fixed });
  console.log(`  → Updated`);
}

console.log(`\nFixed ${bad.length} order(s)`);
process.exit(0);
