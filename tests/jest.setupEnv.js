// Runs before any test file is required. Pins env vars the test suite
// hardcodes assumptions around (e.g. `*.myplatform.test` Host headers for
// subdomain resolution) so switching BASE_DOMAIN in the developer's own
// .env for local frontend testing (e.g. to lvh.me) can never break tests —
// dotenv.config() in src/config/env.js never overwrites a var that's
// already set, so whatever we set here wins.
process.env.BASE_DOMAIN = 'myplatform.test';
