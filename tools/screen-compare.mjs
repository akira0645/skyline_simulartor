import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map(p => JSON.parse(readFileSync(p, 'utf8')));
let bad = 0;
for (const key of Object.keys(a)) {
  const x = a[key], y = b[key] ?? [];
  let diffs = [];
  if (x.length !== y.length) diffs.push(`count ${x.length} vs ${y.length}`);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if ([x[i][0], x[i][2], x[i][3]].join('~') !== [y[i][0], y[i][2], y[i][3]].join('~')) diffs.push(`${x[i].join(' ~ ').slice(0, 230)}\n      vs ${y[i].join(' ~ ').slice(0, 230)}`);
  if (diffs.length) { bad++; console.log(`${key}: ${diffs.length} differences\n   ` + diffs.slice(0, 3).join('\n   ')); }
}
console.log(bad ? `${bad} states differ` : 'all states identical');
