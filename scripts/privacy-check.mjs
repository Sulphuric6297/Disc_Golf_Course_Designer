// Keeps personal details out of this public repository (see "Privacy" in CLAUDE.md). Run by git
// before each commit (.githooks, set up by `npm ci`): it stops a commit whose author is not a
// no-reply address, that adds an email address, or that adds a private scratch file (zz-*).
// With a file argument it checks a commit message instead.
import { execFileSync } from "child_process";
import { readFileSync } from "fs";

// (room for a big commit's changes, a merge of many: the whole of it is read, never cut short)
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
// Addresses that are fine to publish: no-reply ones and example domains. (user@ an IP address
// is a login in a local database's address, not an email.)
const OK = /noreply|no-reply|@example\.(com|org|net)$|@\d+\.\d+\.\d+\.\d+$/i;
const problems = [];
const emails = (text, where) => {
  for (const m of text.match(EMAIL) ?? []) if (!OK.test(m)) problems.push(`${where}: an email address (${m.replace(/^(.).*@/, "$1…@")})`);
};

const msgFile = process.argv[2];
if (msgFile) {
  emails(readFileSync(msgFile, "utf8").split("\n").filter(l => !l.startsWith("#")).join("\n"), "commit message");
} else {
  const author = git("var", "GIT_AUTHOR_IDENT").replace(/>.*$/s, "").split("<")[1] ?? "";
  if (!OK.test(author)) problems.push(`commit author: use a no-reply address (git config user.email <id>+<name>@users.noreply.github.com)`);
  for (const f of git("diff", "--cached", "--name-only", "--diff-filter=AR").split("\n").filter(Boolean)) {
    if (/(^|\/)zz-/.test(f)) problems.push(`${f}: a private scratch file (zz-*) stays local`);
  }
  let file = "";
  for (const line of git("diff", "--cached", "-U0", "--diff-filter=AM", "--no-color").split("\n")) {
    if (line.startsWith("+++ ")) file = line.slice(6);
    else if (line.startsWith("+") && file !== "package-lock.json") emails(line, file);
  }
}
if (problems.length) {
  console.error("Privacy check: not committed.\n" + [...new Set(problems)].map(p => `  - ${p}`).join("\n"));
  console.error("This repository is public: no names, emails, addresses, places or photos of anyone's property.");
  process.exit(1);
}
