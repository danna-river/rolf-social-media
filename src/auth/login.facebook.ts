import { runLoginFlow } from './login-common';

runLoginFlow('facebook').catch((err) => {
  console.error(err);
  process.exit(1);
});
