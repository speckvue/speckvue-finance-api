const prefix = process.env.API_PREFIX;

const version = process.env.API_VERSION;

const port = process.env.APP_PORT;

fetch(
  'http://127.0.0.1:' + port + '/' + prefix + '/v' + version + '/health/ready',
  { signal: AbortSignal.timeout(4000) },
)
  .then((r) => {
    if (!r.ok) process.exitCode = 1;
  })
  .catch(() => {
    process.exitCode = 1;
  });
