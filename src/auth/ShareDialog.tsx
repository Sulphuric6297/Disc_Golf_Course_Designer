// Who has the open course, and (for its owners) sharing it: viewers look, editors change, owners
// also share and delete.
import { useEffect, useState } from "react";
import { inputCls, Section } from "../components/ui";
import { api, useAuth } from "./api";
import { setApproval, useServerCourse, type Role } from "./courses";
import { Dialog, Form } from "./parts";

interface Member { userId: string; username: string; displayName: string; role: Role }
const ROLES: { value: Role; label: string }[] = [{ value: "viewer", label: "Viewer" }, { value: "editor", label: "Editor" }, { value: "owner", label: "Owner" }];

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const { id, role, approval } = useServerCourse();
  const me = useAuth(s => s.session!.user!);
  const [members, setMembers] = useState<Member[]>([]);
  const [people, setPeople] = useState<{ username: string; displayName: string }[]>([]);
  const [username, setUsername] = useState("");
  const [newRole, setNewRole] = useState<Role>("editor");
  const [error, setError] = useState("");
  const owner = role === "owner";

  const refresh = async () => { if (id) setMembers(await api<Member[]>("GET", `courses/${id}/members`)); };
  useEffect(() => { void refresh(); if (owner) void api<{ username: string; displayName: string }[]>("GET", "people").then(setPeople); }, [id]);

  const change = async (fn: () => Promise<unknown>) => {
    setError("");
    try { await fn(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
  };

  if (!id) {
    return <Dialog title="Share" onClose={onClose} testid="share-dialog"><p className="text-sm text-zinc-300">Add something to the course first: it's saved, then it can be shared.</p></Dialog>;
  }
  const others = people.filter(p => !members.some(m => m.username === p.username));
  return (
    <Dialog title="Share" onClose={onClose} testid="share-dialog">
      <div className="-mx-4">
        {owner && (
          <Section title="Add someone">
            <Form compact submit="Share" testid="share-add" onSubmit={async () => {
              await api("POST", `courses/${id}/members`, { username, role: newRole });
              setUsername("");
              await refresh();
            }}>
              <div className="flex gap-2">
                <label className="flex-1 min-w-0">
                  <span className="sr-only">Username</span>
                  <input className={inputCls} list="share-people" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" spellCheck={false} aria-label="Username" />
                </label>
                <select className="shrink-0 w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm touch:py-2.5 text-zinc-100 focus:outline-none focus:border-orange-400" value={newRole} onChange={e => setNewRole(e.target.value as Role)} aria-label="Role">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <datalist id="share-people">{others.map(p => <option key={p.username} value={p.username}>{p.displayName}</option>)}</datalist>
            </Form>
          </Section>
        )}
        {owner && (
          <Section title="Editors' changes">
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input type="checkbox" checked={approval} onChange={e => void change(() => setApproval(e.target.checked))} data-testid="approval-toggle" />
              Need my OK before they go in
            </label>
          </Section>
        )}
        <Section title="Has it">
          <ul className="divide-y divide-zinc-800" data-testid="members">
            {members.map(m => (
              <li key={m.userId} className="py-2 flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="text-zinc-100">{m.displayName}</span> <span className="text-zinc-500">{m.username}{m.userId === me.id ? " · you" : ""}</span>
                </div>
                {owner ? (
                  <select className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-100" value={m.role} aria-label={`Role for ${m.username}`}
                    onChange={e => void change(() => api("POST", `courses/${id}/members`, { username: m.username, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                ) : <span className="text-xs text-zinc-400">{ROLES.find(r => r.value === m.role)!.label}</span>}
                {(owner || m.userId === me.id) && (
                  <button className="text-xs text-red-300 hover:text-red-200" onClick={() => void change(() => api("DELETE", `courses/${id}/members/${m.userId}`))}>
                    {m.userId === me.id ? "Leave" : "Remove"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
        </Section>
      </div>
    </Dialog>
  );
}
