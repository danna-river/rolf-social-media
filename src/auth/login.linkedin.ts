import { runLoginFlow } from './login-common';

// LinkedIn is manual-first for peer collection. This login profile is intended
// for viewing ROLF's own page and, only if you accept the policy risk, for
// low-volume public-page collection (--accept-linkedin-risk).
runLoginFlow('linkedin').catch((err) => {
  console.error(err);
  process.exit(1);
});
