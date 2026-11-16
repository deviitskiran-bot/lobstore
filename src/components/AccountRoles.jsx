import React, { useEffect, useState } from "react";

export default function AccountRoles({ api, notify }) {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    api("/accounts")
      .then(setAccounts)
      .catch((e) => notify(e.message));
  }, []);
  return (
    <>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          try {
            await api("/accounts", {
              method: "POST",
              body: JSON.stringify(Object.fromEntries(new FormData(form))),
            });
            setAccounts(await api("/accounts"));
            form.reset();
            notify("Account created");
          } catch (e) {
            notify(e.message);
          }
        }}
      >
        <h2>Add a team account</h2>
        <label>
          Name
          <input name="name" required />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Initial password
          <input name="password" type="password" minLength={10} required />
        </label>
        <label>
          Role
          <select name="role">
            <option>Staff</option>
            <option>Manager</option>
          </select>
        </label>
        <button className="button primary">Create team account</button>
      </form>
      <div className="role-list">
        {accounts.map((a) => (
          <div key={a.id}>
            <strong>{a.name}</strong>
            <small>{a.email}</small>
            <select
              value={a.role}
              onChange={async (e) => {
                try {
                  await api("/accounts/" + a.id, {
                    method: "PUT",
                    body: JSON.stringify({ role: e.target.value }),
                  });
                  setAccounts(await api("/accounts"));
                  notify("Role updated");
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              {["Owner", "Manager", "Staff"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </>
  );
}
