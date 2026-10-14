const fs = require('node:fs');

const { randomBytes } = require('node:crypto');

if (!fs.existsSync('.env')) fs.copyFileSync('.env.example', '.env');

let text = fs.readFileSync('.env', 'utf8');
const original = text;
for (const line of fs.readFileSync('.env.example', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
  if (match && !new RegExp('^' + match[1] + '=', 'm').test(text))
    text += '\n' + line;
}

for (const key of [
  'SESSION_SECRET',
  'POSTGRES_PASSWORD',
  'POSTGRES_MIGRATION_PASSWORD',
  'POSTGRES_ADMIN_PASSWORD',
  'REDIS_PASSWORD',
]) {
  const pattern = new RegExp('^' + key + '=replace_[^\\r\\n]*', 'm');
  text = text.replace(
    pattern,
    key + '=' + randomBytes(48).toString('base64url'),
  );
}

if (text !== original) fs.writeFileSync('.env', text);

console.log('Local configuration initialized; secrets were not printed.');
