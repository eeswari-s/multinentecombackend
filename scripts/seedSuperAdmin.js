/**
 * One-off operational script to bootstrap the very first Super Admin
 * account. There is no public signup endpoint for super_admin by design —
 * platform-level access must never be self-service.
 *
 * Usage:
 *   node scripts/seedSuperAdmin.js --email owner@platform.com --password "Str0ngPass!" --name "Platform Owner"
 */
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { User } = require('../src/models/user.model');
const { hashPassword } = require('../src/utils/password');

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, '');
    args[key] = process.argv[i + 1];
  }
  return args;
}

async function main() {
  const { email, password, name } = parseArgs();

  if (!email || !password || !name) {
    // eslint-disable-next-line no-console
    console.error('Usage: node scripts/seedSuperAdmin.js --email <email> --password <password> --name <name>');
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  const existing = await User.findOne({ role: 'super_admin', email: email.toLowerCase() });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`A super_admin with email ${email} already exists (id: ${existing._id}). Nothing to do.`);
    await disconnectDatabase();
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({ role: 'super_admin', name, email: email.toLowerCase(), passwordHash });

  // eslint-disable-next-line no-console
  console.log(`Created super_admin ${user.email} (id: ${user._id})`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed super admin:', err);
  await disconnectDatabase();
  process.exitCode = 1;
});
