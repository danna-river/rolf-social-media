import { runLoginFlow } from './login-common';

runLoginFlow('instagram').catch((err) => {
  console.error(err);
  process.exit(1);
});
