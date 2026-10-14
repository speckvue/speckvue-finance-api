const fs = require('node:fs');

const path = require('node:path');

const collect = () => {
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  const sections = [];
  for (const [location, metadata] of Object.entries(lock.packages)) {
    if (!location || metadata.dev || !fs.existsSync(location)) continue;
    const notices = fs
      .readdirSync(location)
      .filter((file) => /^(licen[sc]e|notice|copying)(\.|$)/i.test(file));
    if (!notices.length)
      sections.push(
        `${location} ${metadata.version}\nLicense: ${metadata.license ?? 'Review package metadata'}\n`,
      );
    for (const file of notices) {
      const resolved = path.join(location, file);
      if (fs.statSync(resolved).isFile())
        sections.push(
          `${location} ${metadata.version} — ${file}\n${fs.readFileSync(resolved, 'utf8')}`,
        );
    }
  }
  fs.writeFileSync(
    'THIRD_PARTY_LICENSES.txt',
    'Third-party runtime dependency notices. First-party code remains proprietary.\n\n' +
      sections.join('\n\n').replace(/\r\n/g, '\n').trimEnd() +
      '\n',
  );
};

collect();
