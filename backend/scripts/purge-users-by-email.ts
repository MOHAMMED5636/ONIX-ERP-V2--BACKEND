/**
 * Permanently delete users by work email (frees unique email / employeeId).
 * Usage:
 *   npx ts-node scripts/purge-users-by-email.ts user1@domain.com user2@domain.com
 */
import 'dotenv/config';
import { permanentlyDeleteUsersByEmails } from '../src/services/employeePermanentDelete.service';

async function main() {
  const emails = process.argv.slice(2).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) {
    console.error('Usage: npx ts-node scripts/purge-users-by-email.ts email1@x.com [email2@x.com ...]');
    process.exit(1);
  }
  console.log('Purging:', emails.join(', '));
  const results = await permanentlyDeleteUsersByEmails(emails);
  for (const r of results) {
    console.log(r.ok ? `OK   ${r.email}` : `FAIL ${r.email}: ${r.error}`);
  }
  const failed = results.filter((r) => !r.ok);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
