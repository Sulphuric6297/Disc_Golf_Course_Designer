// The admin's: who has an account, invite links, and the activity log.
import { useEffect, useState } from "react";
import { Section, Segmented } from "../components/ui";
import { api, linkFor, useAuth } from "./api";
import { CopyButton, Dialog, Form, Input, when } from "./parts";

interface Person { id: string; username: string; displayName: string; isAdmin: boolean; disabled: boolean; totpEnabled: boolean; locked: boolean; createdAt: string; lastSeenAt: string | null }
interface Invite { id: string; kind: "invite" | "reset"; isAdmin: boolean; note: string; username: string | null; expiresAt: string }
interface Entry { id: number; at: string; action: string; detail: Record<string, unknown>; ip: string | null; username: string | null }

export function PeopleDialog({ onClose }: { onClose: () => void }) {
  const me = useAuth(s => s.session!.user!);
  const [tab, setTab] = useState<"people" | "activity">("people");
  const [people, setPeople] = useState<Person[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [log, setLog] = useState<Entry[]>([]);
  const [link, setLink] = useState<{ url: string; label: string } | null>(null);
  const [note, setNote] = useState("");
  const [asAdmin, setAsAdmin] = useState(false);

  const refresh = async () => {
    setPeople(await api<Person[]>("GET", "admin/users"));
    setInvites(await api<Invite[]>("GET", "admin/invites"));
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (tab === "activity") void api<Entry[]>("GET", "admin/audit").then(setLog); }, [tab]);

  const act = async (fn: () => Promise<unknown>) => { await fn(); await refresh(); };
  const reset = async (p: Person) => {
    if (!confirm(`Reset ${p.username}? They're signed out until they use the link.`)) return;
    const r = await api<{ token: string }>("POST", `admin/users/${p.id}/reset`);
    setLink({ url: linkFor("reset", r.token), label: `Reset link for ${p.username}` });
    await refresh();
  };

  return (
    <Dialog title="People" onClose={onClose} wide testid="people-dialog">
      <div className="mb-3 max-w-xs"><Segmented value={tab} onChange={setTab} options={[{ value: "people", label: "People" }, { value: "activity", label: "Activity" }]} label="Show" /></div>
      {tab === "people" ? (
        <div className="-mx-4">
          <Section title="Invite someone">
            <Form submit="Create invite link" testid="new-invite" onSubmit={async () => {
              const r = await api<{ token: string }>("POST", "admin/invites", { note, isAdmin: asAdmin });
              setLink({ url: linkFor("invite", r.token), label: "Invite link (works once, for 48 hours)" });
              setNote("");
              await refresh();
            }}>
              <Input label="Note (who it's for)" value={note} onChange={setNote} />
              <label className="flex items-center gap-2 text-sm text-zinc-200"><input type="checkbox" checked={asAdmin} onChange={e => setAsAdmin(e.target.checked)} /> Admin</label>
            </Form>
            {link && (
              <div className="mt-3 bg-zinc-950 border border-zinc-800 rounded-lg p-3" data-testid="new-link">
                <div className="text-[12px] text-zinc-400 mb-1">{link.label}</div>
                <div className="flex items-center gap-2"><code className="flex-1 min-w-0 truncate text-xs text-zinc-100">{link.url}</code><CopyButton text={link.url} /></div>
              </div>
            )}
          </Section>

          {invites.length > 0 && (
            <Section title="Open links">
              <ul className="space-y-1.5">
                {invites.map(i => (
                  <li key={i.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-zinc-200">{i.kind === "reset" ? `Reset for ${i.username}` : `Invite${i.isAdmin ? " (admin)" : ""}${i.note ? ` · ${i.note}` : ""}`}<span className="ml-2 text-[12px] text-zinc-500">until {when(i.expiresAt)}</span></span>
                    <button className="text-xs text-red-300 hover:text-red-200" onClick={() => void act(() => api("DELETE", `admin/invites/${i.id}`))}>Cancel</button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={`People (${people.length})`}>
            <ul className="divide-y divide-zinc-800" data-testid="people">
              {people.map(p => (
                <li key={p.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <div className="flex-1 min-w-[180px]">
                    <div className="text-zinc-100 font-medium">{p.displayName} <span className="text-zinc-500 font-normal">{p.username}</span></div>
                    <div className="text-[12px] text-zinc-500">
                      {[p.isAdmin ? "Admin" : "Member", p.disabled && "Disabled", p.locked && "Resting after wrong passwords", !p.totpEnabled && "2FA not set up", `seen ${when(p.lastSeenAt)}`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {p.id !== me.id && (
                    <div className="flex gap-3 text-xs">
                      <button className="text-zinc-300 hover:text-white" onClick={() => void act(() => api("POST", `admin/users/${p.id}`, { isAdmin: !p.isAdmin }))}>{p.isAdmin ? "Remove admin" : "Make admin"}</button>
                      <button className="text-zinc-300 hover:text-white" onClick={() => void act(() => api("POST", `admin/users/${p.id}`, { disabled: !p.disabled }))}>{p.disabled ? "Enable" : "Disable"}</button>
                      <button className="text-zinc-300 hover:text-white" onClick={() => void reset(p)}>Reset</button>
                      <button className="text-red-300 hover:text-red-200" onClick={() => { if (confirm(`Remove ${p.username}'s account?`)) void act(() => api("DELETE", `admin/users/${p.id}`)); }}>Remove</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      ) : (
        <ul className="text-sm divide-y divide-zinc-800" data-testid="activity">
          {log.map(e => (
            <li key={e.id} className="py-1.5 flex gap-3">
              <span className="text-zinc-500 text-[12px] w-40 shrink-0">{when(e.at)}</span>
              <span className="text-zinc-200 flex-1">{e.username ?? "—"} · {e.action}{typeof e.detail.username === "string" ? ` · ${e.detail.username}` : ""}</span>
              <span className="text-zinc-500 text-[12px]">{e.ip}</span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
