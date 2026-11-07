import { Store } from './src/store.js';

const store = new Store('./demo-data');
const res = store.search('Hermes');
console.log('store.search res:', res);
