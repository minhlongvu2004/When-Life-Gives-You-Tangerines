"""Builds app/public/data/clients.json: which account each client_id belongs to.

The app is organised by account_id, but the dataset also lists people by client_id
(clients.csv). dispositions.csv links the two: every client is either the owner of one
account or an authorized user on it. This lets the app accept either kind of ID.

Usage:  python pipeline/build_client_map.py path/to/data
Output: { "<client_id>": [<account_id>, "owner" | "authorized user"], ... }
"""
import json
import os
import sys

import pandas as pd


def main(data_dir: str) -> None:
    disp = pd.read_csv(os.path.join(data_dir, "dispositions.csv"))
    accounts = set(pd.read_csv(os.path.join(data_dir, "accounts.csv")).account_id)

    assert disp.client_id.is_unique, "a client appears on more than one account"
    assert disp.account_id.isin(accounts).all(), "a disposition points at an unknown account"
    assert set(disp.type) <= {"owner", "authorized user"}, f"unexpected roles: {set(disp.type)}"
    assert (disp[disp.type == "owner"].groupby("account_id").size() == 1).all(), "an account has several owners"

    out = {str(int(r.client_id)): [int(r.account_id), r.type] for r in disp.itertuples()}
    dest = os.path.join(os.path.dirname(__file__), "..", "app", "public", "data", "clients.json")
    with open(dest, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    owners = sum(1 for v in out.values() if v[1] == "owner")
    print(f"wrote {len(out)} clients ({owners} owners, {len(out) - owners} authorized users) to {os.path.normpath(dest)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
