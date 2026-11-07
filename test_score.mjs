import { Store } from './src/store.js';
import { tokenize, matchScore } from './src/text.js';

const store = new Store('./demo-data');
console.log('总条目:', store.index.count());

const q = 'Hermes';
const rows = store.index.all();
console.log('候选 rows:', rows.length);

const corpusTokens = new Set();
const bodies = new Map();
for (const row of rows) {
  const body = store.get(row.id).content || '';
  bodies.set(row.id, body);
  for (const t of tokenize(row.title + ' ' + body)) corpusTokens.add(t);
}
console.log('语料库词元数:', corpusTokens.size);
console.log('查询词 tokenize:', tokenize(q));

for (const row of rows.slice(0, 5)) {
  const body = bodies.get(row.id);
  const score = matchScore(q, { title: row.title, body }, corpusTokens);
  console.log(`- [${score.toFixed(3)}] ${row.title}`);
}
