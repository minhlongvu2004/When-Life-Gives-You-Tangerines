// The dataset has two kinds of ID: account_id (4,500) and client_id (5,369, one per person on an account).
// Each client belongs to exactly one account, either as its owner or as an authorized user.
// The two ID ranges never overlap, so the app can accept either one.

export type ClientRole = "owner" | "authorized user";
export type ClientMap = Map<number, { account: number; role: ClientRole }>;

export interface Resolved {
  account: number;
  /** set when the number typed was a client ID rather than an account ID */
  client?: number;
  role?: ClientRole;
}

/** Reads an ID from text, ignoring spaces, commas, "#" and quotes copied from a spreadsheet. */
export function parseId(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits || digits.length > 15) return null;
  return Number(digits);
}

/** Finds the account for an account ID or a client ID. Account IDs win if a number is both. */
export function resolveId(n: number | null, hasAccount: (n: number) => boolean, clients: ClientMap | undefined): Resolved | null {
  if (n === null) return null;
  if (hasAccount(n)) return { account: n };
  const c = clients?.get(n);
  return c ? { account: c.account, client: n, role: c.role } : null;
}
