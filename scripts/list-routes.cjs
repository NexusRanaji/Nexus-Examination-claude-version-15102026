const fs = require('fs');
const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');
const routes = [];
lines.forEach((l, i) => {
  const m = l.match(/app\.(get|post|put|patch|delete)\(['"]([^'"]+)['"]/);
  if (m) routes.push(`${m[1].toUpperCase()} ${m[2]} (line ${i + 1})`);
});
console.log(`Total routes: ${routes.length}`);
routes.forEach(r => console.log(r));

