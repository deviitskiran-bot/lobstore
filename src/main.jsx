import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Package,
  Users,
  Store,
  Network,
  Wallet,
  Bell,
  Settings,
  Search,
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Download,
  Sun,
  Moon,
  LogOut,
  X,
  MoreHorizontal,
  Box,
  PanelLeft,
  CheckCircle2,
} from "lucide-react";
import { seed, money } from "./data";
import { toCsv } from "../shared/csv.js";
import { nextPayDate } from "../shared/dates.js";
import AuthForm from "./components/AuthForm.jsx";
import AccountRoles from "./components/AccountRoles.jsx";
import "./style.css";
const icons = {
  Overview: LayoutDashboard,
  Inventory: Package,
  Employees: Users,
  Stores: Store,
  Franchises: Network,
  Payroll: Wallet,
  Notifications: Bell,
  Settings,
};
const entity = {
  Inventory: "inventory",
  Employees: "employees",
  Stores: "stores",
  Franchises: "franchises",
};
const fields = {
  inventory: {
    name: "Product name",
    sku: "SKU",
    category: "Category",
    stock: "Stock",
    minimum: "Low-stock threshold",
    price: "Selling price ($)",
    cost: "Unit cost ($)",
    location: "Store",
  },
  employees: {
    name: "Full name",
    email: "Email",
    role: "Role",
    location: "Store",
    salary: "Monthly salary ($)",
    due: "Next pay date",
    status: "Status",
  },
  stores: {
    name: "Store name",
    address: "Address",
    manager: "Manager",
    revenue: "Revenue ($)",
    expenses: "Expenses ($)",
    status: "Status",
  },
  franchises: {
    name: "Franchise name",
    address: "Address",
    manager: "Operator",
    revenue: "Revenue ($)",
    expenses: "Expenses ($)",
    status: "Status",
  },
};
const numeric = [
  "stock",
  "minimum",
  "price",
  "cost",
  "salary",
  "revenue",
  "expenses",
];
function emptyWorkspace() {
  return {
    inventory: [],
    employees: [],
    stores: [],
    franchises: [],
    activity: [],
  };
}
function demoWorkspace() {
  try {
    return (
      JSON.parse(localStorage.getItem("lob-data")) || structuredClone(seed)
    );
  } catch {
    return structuredClone(seed);
  }
}
function savedUser() {
  try {
    return JSON.parse(sessionStorage.getItem("lob-user"));
  } catch {
    return null;
  }
}
function App() {
  const [page, setPage] = useState("Overview"),
    [data, setData] = useState(() =>
      savedUser() ? emptyWorkspace() : demoWorkspace(),
    ),
    [user, setUser] = useState(() => savedUser()),
    [demo, setDemo] = useState(!savedUser()),
    [auth, setAuth] = useState(null),
    [dark, setDark] = useState(localStorage.getItem("lob-theme") === "dark"),
    [query, setQuery] = useState(""),
    [store, setStore] = useState("All stores"),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [read, setRead] = useState([]),
    [mobile, setMobile] = useState(false);
  const role = user?.role || "Owner",
    canEdit = role !== "Staff",
    isOwner = role === "Owner";
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("lob-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (demo) localStorage.setItem("lob-data", JSON.stringify(data));
  }, [data, demo]);
  async function api(path, options = {}) {
    const res = await fetch("/api" + path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const result = await res.json();
    if (!res.ok) throw Error(result.error || "Request failed");
    return result;
  }
  async function refresh() {
    const [current, workspace] = await Promise.all([
      api("/me"),
      api("/workspace"),
    ]);
    setUser(current);
    sessionStorage.setItem("lob-user", JSON.stringify(current));
    setData(workspace);
  }
  useEffect(() => {
    if (user && !demo)
      refresh().catch((e) => {
        notify(e.message);
        setAuth("login");
        setData(emptyWorkspace());
      });
  }, [user?.id, demo]);
  function notify(s) {
    setToast(s);
    setTimeout(() => setToast(""), 4000);
  }
  function navigate(p) {
    setPage(p);
    setQuery("");
    setMobile(false);
  }
  const scopedInventory = data.inventory.filter(
      (p) => store === "All stores" || p.location === store,
    ),
    scopedEmployees = data.employees.filter(
      (e) => store === "All stores" || e.location === store,
    );
  const low = scopedInventory.filter((p) => p.stock <= p.minimum),
    due = scopedEmployees.filter(
      (e) =>
        e.status === "Active" &&
        e.due <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    );
  const notifications = [
    ...low.map((p) => ({
      id: p.id,
      title: `${p.name} is running low`,
      text: `${p.stock} units remaining at ${p.location}. Reorder threshold: ${p.minimum}.`,
      page: "Inventory",
      kind: "stock",
    })),
    ...due.map((e) => ({
      id: e.id,
      title: `Salary due · ${e.name}`,
      text: `${money(e.salary)} is due on ${e.due}.`,
      page: "Payroll",
      kind: "payroll",
    })),
  ];
  const scoped = data.stores.filter(
      (s) => store === "All stores" || s.name === store,
    ),
    revenue = scoped.reduce((a, s) => a + Number(s.revenue || 0), 0),
    expenses = scoped.reduce((a, s) => a + Number(s.expenses || 0), 0),
    profit = revenue - expenses;
  async function save(e) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.target));
    for (const k of numeric) if (k in values) values[k] = Number(values[k]);
    try {
      if (!demo) {
        await api(
          "/records/" +
            modal.kind +
            (modal.record ? "/" + modal.record.id : ""),
          {
            method: modal.record ? "PUT" : "POST",
            body: JSON.stringify(values),
          },
        );
        await refresh();
      } else {
        setData((d) => ({
          ...d,
          [modal.kind]: modal.record
            ? d[modal.kind].map((r) =>
                r.id === modal.record.id ? { ...values, id: r.id } : r,
              )
            : [...d[modal.kind], { ...values, id: crypto.randomUUID() }],
          activity: [
            {
              id: crypto.randomUUID(),
              text: `${modal.record ? "Updated" : "Added"} ${values.name}`,
              time: "Just now",
            },
            ...d.activity,
          ],
        }));
      }
      setModal(null);
      notify("Changes saved");
    } catch (e) {
      notify(e.message);
    }
  }
  async function remove(kind, id) {
    try {
      if (!demo) {
        await api("/records/" + kind + "/" + id, { method: "DELETE" });
        await refresh();
      } else
        setData((d) => ({ ...d, [kind]: d[kind].filter((r) => r.id !== id) }));
      setModal(null);
      notify("Record deleted");
    } catch (e) {
      notify(e.message);
    }
  }
  async function pay(e) {
    try {
      const record = { ...e, due: nextPayDate(e.due) };
      if (!demo) {
        await api("/payroll/" + e.id, { method: "POST" });
        await refresh();
      } else
        setData((d) => ({
          ...d,
          employees: d.employees.map((x) => (x.id === e.id ? record : x)),
          activity: [
            {
              id: crypto.randomUUID(),
              text: `Salary payment recorded for ${e.name}`,
              time: "Just now",
            },
            ...d.activity,
          ],
        }));
      notify("Salary payment recorded");
    } catch (e) {
      notify(e.message);
    }
  }
  function exportData() {
    const rows = entity[page] ? filtered(entity[page]) : scoped;
    const csv = toCsv(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `lobstore-${page.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Report exported");
  }
  const filtered = (kind) =>
    data[kind].filter(
      (r) =>
        (store === "All stores" || !r.location || r.location === store) &&
        JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
    );
  return (
    <div className="app">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a className="brand" onClick={() => navigate("Overview")}>
          <span className="logo">
            <Box size={22} />
          </span>
          Lobstore<span className="brand-dot">.</span>
        </a>
        <button className="workspace" onClick={() => navigate("Settings")}>
          <span className="workspace-avatar">L</span>
          <span>
            Lobstore workspace
            <small>{demo ? "Demo workspace" : "Business workspace"}</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {Object.entries(icons)
            .slice(0, 6)
            .filter(([p]) => isOwner || !["Franchises", "Payroll"].includes(p))
            .map(([p, I]) => (
              <button
                key={p}
                className={page === p ? "active" : ""}
                onClick={() => navigate(p)}
              >
                <I size={18} />
                {p}
                {p === "Inventory" && (
                  <span className="nav-count">{data.inventory.length}</span>
                )}
              </button>
            ))}
        </nav>
        <div className="nav-caption manage">MANAGE</div>
        <nav>
          {["Notifications", "Settings"].map((p) => {
            const I = icons[p];
            return (
              <button
                key={p}
                className={page === p ? "active" : ""}
                onClick={() => navigate(p)}
              >
                <I size={18} />
                {p}
                {p === "Notifications" && (
                  <span className="notice-count">
                    {notifications.filter((n) => !read.includes(n.id)).length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">✧</span>
            <strong>Store records at a glance.</strong>
            <p>Inventory, staff and store totals.</p>
            <button onClick={() => navigate("Stores")}>
              Explore your workspace <ArrowUpRight size={14} />
            </button>
          </div>
          <button className="theme-toggle" onClick={() => setDark(!dark)}>
            {dark ? <Moon size={16} /> : <Sun size={16} />}
            <span>{dark ? "Dark appearance" : "Light appearance"}</span>
            <span className="toggle">
              <i />
            </span>
          </button>
          <button
            className="profile"
            onClick={() =>
              demo ? setAuth("login") : setModal({ account: true })
            }
          >
            <span className="avatar">
              {user?.name?.slice(0, 2).toUpperCase() || "DO"}
            </span>
            <span>
              <strong>{user?.name || "Demo owner"}</strong>
              <small>
                {role} · {demo ? "Demo account" : "Account"}
              </small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumb">
            <button
              aria-label="Open navigation"
              className="mobile-toggle"
              onClick={() => setMobile(!mobile)}
            >
              <PanelLeft size={18} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="header-actions">
            <span className="live">
              <i />
              {demo ? "Demo workspace" : "Business workspace"}
            </span>
            {demo && (
              <button className="signin" onClick={() => setAuth("login")}>
                Sign in <ArrowUpRight size={13} />
              </button>
            )}
            <span className="divider" />
            <button
              className="icon-button bell"
              aria-label="Notifications"
              onClick={() => navigate("Notifications")}
            >
              <Bell size={18} />
              {notifications.length > read.length && <i />}
            </button>
            <span className="avatar small">
              {user?.name?.slice(0, 2).toUpperCase() || "DO"}
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR BUSINESS, AT A GLANCE</div>
              <h1>{page === "Overview" ? "Business overview" : page}</h1>
              <p>
                {
                  {
                    Overview:
                      "A clear picture of your business. All in one place.",
                    Inventory:
                      "Track products, stock levels and reorder thresholds.",
                    Employees: "Manage employee records and store assignments.",
                    Stores: "Every location, connected.",
                    Franchises: "A growing business. A connected network.",
                    Payroll: "Manage salaries and keep your team on track.",
                    Notifications:
                      "The things that need your attention, in one place.",
                    Settings: "Make Lobstore work for your business.",
                  }[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {page === "Overview" || entity[page] ? (
                <button className="button" onClick={exportData}>
                  <Download size={15} />
                  Export report
                </button>
              ) : null}
              {canEdit && (page === "Overview" || entity[page]) && (
                <button
                  className="button primary"
                  onClick={() =>
                    setModal({ kind: entity[page] || "inventory" })
                  }
                >
                  <Plus size={16} />
                  Add{" "}
                  {page === "Employees"
                    ? "employee"
                    : page === "Stores"
                      ? "store"
                      : page === "Franchises"
                        ? "franchise"
                        : "product"}
                </button>
              )}
            </div>
          </div>
          <div className="filterbar">
            <div className="filters">
              <label className="select-wrap">
                <Store size={15} />
                <select
                  aria-label="Store filter"
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                >
                  <option>All stores</option>
                  {data.stores.map((s) => (
                    <option key={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <span className="updated">
              <span />
              Current record totals
            </span>
          </div>
          {page === "Overview" && (
            <>
              <div className="stats">
                {[
                  {
                    label: "Recorded revenue",
                    value: money(revenue),
                    note: "Entered in store records",
                    icon: Wallet,
                  },
                  {
                    label: "Recorded profit",
                    value: money(profit),
                    note: "Revenue minus expenses",
                    icon: ArrowUpRight,
                  },
                  {
                    label: "Inventory at cost",
                    value: money(
                      scopedInventory.reduce(
                        (a, p) => a + (p.stock || 0) * (p.cost || 0),
                        0,
                      ),
                    ),
                    note: `${low.length} products at or below threshold`,
                    icon: Package,
                  },
                  {
                    label: "Active employees",
                    value: scopedEmployees.filter((e) => e.status === "Active")
                      .length,
                    note: "In selected stores",
                    icon: Users,
                  },
                ].map((s) => (
                  <article className="stat" key={s.label}>
                    <div className="stat-top">
                      {s.label}
                      <s.icon size={16} />
                    </div>
                    <div className="stat-value">{s.value}</div>
                    <div className="stat-footer">{s.note}</div>
                  </article>
                ))}
              </div>
              <div className="chart-row">
                <section className="card revenue-card">
                  <div className="card-heading">
                    <div>
                      <h2>Store totals</h2>
                      <p>
                        Manually entered revenue and expenses; no sales ledger
                      </p>
                    </div>
                  </div>
                  <div className="store-totals">
                    {scoped.map((s) => (
                      <div className="store-total" key={s.id}>
                        <strong>{s.name}</strong>
                        <div>
                          <span>Revenue</span>
                          <meter
                            aria-label={s.name + " revenue"}
                            min="0"
                            max={Math.max(
                              1,
                              ...scoped.flatMap((s) => [
                                s.revenue || 0,
                                s.expenses || 0,
                              ]),
                            )}
                            value={s.revenue || 0}
                          />
                          <span>{money(s.revenue)}</span>
                        </div>
                        <div>
                          <span>Expenses</span>
                          <meter
                            aria-label={s.name + " expenses"}
                            min="0"
                            max={Math.max(
                              1,
                              ...scoped.flatMap((s) => [
                                s.revenue || 0,
                                s.expenses || 0,
                              ]),
                            )}
                            value={s.expenses || 0}
                          />
                          <span>{money(s.expenses)}</span>
                        </div>
                      </div>
                    ))}
                    {!scoped.length && (
                      <div className="empty">
                        Add a store to start tracking totals.
                      </div>
                    )}
                  </div>
                </section>
                <section className="card attention">
                  <div className="card-heading">
                    <h2>
                      Needs attention{" "}
                      <span className="count">{notifications.length}</span>
                    </h2>
                    <span className="status-dot" />
                  </div>
                  <p className="attention-sub">
                    A few things to keep on your radar.
                  </p>
                  <div className="attention-item">
                    <span className="attention-icon amber-bg">
                      <Package size={17} />
                    </span>
                    <div>
                      <strong>
                        Low stock alert{" "}
                        <span className="badge amber">{low.length} items</span>
                      </strong>
                      <p>
                        Some products are running low.
                        <br />
                        Keep your bestsellers in stock.
                      </p>
                      <button onClick={() => navigate("Inventory")}>
                        Review inventory <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="attention-item">
                    <span className="attention-icon blue-bg">
                      <Wallet size={17} />
                    </span>
                    <div>
                      <strong>
                        Upcoming payroll{" "}
                        <span className="badge blue">{due.length} due</span>
                      </strong>
                      <p>
                        {money(due.reduce((a, e) => a + e.salary, 0))} in
                        salaries coming up.
                        <br />
                        Your team is counting on you.
                      </p>
                      <button
                        onClick={() =>
                          navigate(isOwner ? "Payroll" : "Employees")
                        }
                      >
                        View payroll <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                  <button
                    className="card-link"
                    onClick={() => navigate("Notifications")}
                  >
                    View all notifications <ArrowRight size={14} />
                  </button>
                </section>
              </div>
              <div className="bottom-row">
                <section className="card stores-card">
                  <div className="card-heading">
                    <div>
                      <h2>Store performance</h2>
                      <p>Your locations, side by side</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("Stores")}
                    >
                      View stores <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Store</th>
                        <th>Revenue</th>
                        <th>Net profit</th>
                        <th>Profit margin</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {scoped.map((s, i) => (
                        <tr key={s.id}>
                          <td>
                            <div className="store-name">
                              <span className="store-tile">
                                <Store size={17} />
                              </span>
                              <div>
                                <strong>{s.name}</strong>
                                <small>{s.address.split(",").at(-1)}</small>
                              </div>
                            </div>
                          </td>
                          <td>{money(s.revenue)}</td>
                          <td>{money(s.revenue - s.expenses)}</td>
                          <td>
                            {s.revenue > 0
                              ? (
                                  ((s.revenue - s.expenses) / s.revenue) *
                                  100
                                ).toFixed(1) + "%"
                              : "—"}
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={"Edit " + s.name}
                              onClick={() =>
                                canEdit
                                  ? setModal({ kind: "stores", record: s })
                                  : navigate("Stores")
                              }
                            >
                              <ChevronRight size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <section className="card activity">
                  <div className="card-heading">
                    <h2>Recent activity</h2>
                    <span className="badge">Recent records</span>
                  </div>
                  <div className="timeline">
                    {data.activity.slice(0, 4).map((a, i) => (
                      <div className="activity-item" key={a.id}>
                        <span className={"activity-dot dot-" + i}>
                          {i === 0 ? (
                            <Package size={13} />
                          ) : i === 1 ? (
                            <Wallet size={13} />
                          ) : i === 2 ? (
                            <Store size={13} />
                          ) : (
                            <Users size={13} />
                          )}
                        </span>
                        <div>
                          <p>{a.text}</p>
                          <small>{a.time}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="card-link"
                    onClick={() => setModal({ logs: true })}
                  >
                    View activity log <ArrowRight size={14} />
                  </button>
                </section>
              </div>
              <div className="overview-note">
                <CheckCircle2 size={14} /> Totals are calculated from your
                current records.<span>Lobstore / Workspace overview</span>
              </div>
            </>
          )}
          {entity[page] && (
            <section className="card records">
              <div className="card-heading">
                <h2>
                  {page}{" "}
                  <span className="count">{filtered(entity[page]).length}</span>
                </h2>
                <label className="search">
                  <Search size={15} />
                  <input
                    placeholder={`Search ${page.toLowerCase()}…`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {Object.entries(fields[entity[page]])
                        .filter(
                          ([k]) =>
                            ![
                              "minimum",
                              "cost",
                              "address",
                              "email",
                              "due",
                            ].includes(k) &&
                            (isOwner || k !== "salary"),
                        )
                        .map(([k, v]) => (
                          <th key={k}>{v.replace(" ($)", "")}</th>
                        ))}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered(entity[page]).map((r) => (
                      <tr key={r.id}>
                        {Object.keys(fields[entity[page]])
                          .filter(
                            (k) =>
                              ![
                                "minimum",
                                "cost",
                                "address",
                                "email",
                                "due",
                              ].includes(k) &&
                              (isOwner || k !== "salary"),
                          )
                          .map((k) => (
                            <td key={k}>
                              {k === "name" ? (
                                <strong>{r[k]}</strong>
                              ) : [
                                  "price",
                                  "salary",
                                  "revenue",
                                  "expenses",
                                ].includes(k) ? (
                                money(r[k])
                              ) : k === "stock" ? (
                                <span
                                  className={
                                    "badge " +
                                    (r.stock <= r.minimum ? "amber" : "green")
                                  }
                                >
                                  {r.stock} units
                                </span>
                              ) : k === "status" ? (
                                <span className="badge green">{r[k]}</span>
                              ) : (
                                r[k]
                              )}
                            </td>
                          ))}
                        <td>
                          {canEdit ? (
                            <button
                              className="button tiny"
                              onClick={() =>
                                setModal({ kind: entity[page], record: r })
                              }
                            >
                              Edit
                            </button>
                          ) : (
                            <span className="muted">View only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered(entity[page]).length && (
                  <div className="empty">
                    No records found. Try another search or add a record.
                  </div>
                )}
              </div>
              <div className="table-footer">
                {filtered(entity[page]).length} records
                <span>All changes are saved automatically</span>
              </div>
            </section>
          )}
          {page === "Payroll" &&
            (isOwner ? (
              <section className="card records">
                <div className="card-heading">
                  <div>
                    <h2>Salary schedule</h2>
                    <p>
                      Total monthly payroll:{" "}
                      {money(
                        data.employees.reduce((a, e) => a + (e.salary || 0), 0),
                      )}
                    </p>
                  </div>
                  <span className="badge amber">{due.length} payments due</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Store</th>
                      <th>Salary</th>
                      <th>Next payment</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.employees.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <strong>{e.name}</strong>
                        </td>
                        <td>{e.location}</td>
                        <td>{money(e.salary)}</td>
                        <td>{e.due}</td>
                        <td>
                          <button
                            className="button tiny"
                            onClick={() => setModal({ payment: e })}
                          >
                            Record payment
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : (
              <div className="empty">
                Payroll is available to workspace owners.
              </div>
            ))}
          {page === "Notifications" && (
            <section className="card">
              <div className="card-heading">
                <h2>Notification center</h2>
                <button
                  className="button tiny"
                  onClick={() => setRead(notifications.map((n) => n.id))}
                >
                  Mark all as read
                </button>
              </div>
              {notifications.map((n) => (
                <div
                  className={
                    "notification " + (read.includes(n.id) ? "read" : "")
                  }
                  key={n.id}
                >
                  <span
                    className={
                      "attention-icon " +
                      (n.kind === "stock" ? "amber-bg" : "blue-bg")
                    }
                  >
                    {n.kind === "stock" ? (
                      <Package size={18} />
                    ) : (
                      <Wallet size={18} />
                    )}
                  </span>
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.text}</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      setRead([...read, n.id]);
                      navigate(
                        n.page === "Payroll" && !isOwner ? "Employees" : n.page,
                      );
                    }}
                  >
                    Review <ArrowRight size={14} />
                  </button>
                </div>
              ))}
              {!notifications.length && (
                <div className="empty">You're all caught up.</div>
              )}
            </section>
          )}
          {page === "Settings" && (
            <div className="settings-grid">
              <section className="card">
                <div className="card-heading">
                  <h2>Workspace preferences</h2>
                </div>
                <div className="setting">
                  <div>
                    <strong>Appearance</strong>
                    <p>A comfortable workspace, day or night.</p>
                  </div>
                  <button className="button" onClick={() => setDark(!dark)}>
                    {dark ? <Sun size={16} /> : <Moon size={16} />}Switch to{" "}
                    {dark ? "light" : "dark"}
                  </button>
                </div>
                <div className="setting">
                  <div>
                    <strong>Account</strong>
                    <p>
                      {demo
                        ? "You are exploring a local demo workspace."
                        : user?.email}
                    </p>
                  </div>
                  <button
                    className="button"
                    onClick={() =>
                      demo ? setAuth("signup") : setModal({ account: true })
                    }
                  >
                    {demo ? "Create account" : "Manage account"}
                  </button>
                </div>
              </section>
              <section className="card">
                <div className="card-heading">
                  <h2>Workspace access</h2>
                </div>
                <div className="role-list">
                  {[
                    [
                      "Owner",
                      "Full workspace access, payroll and franchise management.",
                    ],
                    [
                      "Manager",
                      "Manage inventory, employees and store records.",
                    ],
                    [
                      "Staff",
                      "Read-only access to inventory, employees and stores.",
                    ],
                  ].map(([r, d]) => (
                    <div key={r}>
                      <span className="badge">{r}</span>
                      <p>{d}</p>
                    </div>
                  ))}
                </div>
                <p className="settings-note">
                  Employee records are separate from login accounts. Owners can
                  change account roles below.
                </p>
                {!demo && isOwner && <AccountRoles api={api} notify={notify} />}
              </section>
            </div>
          )}
          <footer>
            <span>
              <span className="footer-logo">◈</span> Lobstore{" "}
              <span className="footer-copy">
                Inventory and store management.
              </span>
            </span>
            <span>
              <i className="status-dot" />
              {demo
                ? "Demo data · stored on this device"
                : "Workspace connected"}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="overlay"
          onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}
        >
          <section className="modal">
            <button
              className="close icon-button"
              onClick={() => setModal(null)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
            {modal.kind ? (
              <>
                <h2>
                  {modal.record ? "Edit" : "Add"}{" "}
                  {modal.kind === "inventory"
                    ? "product"
                    : modal.kind === "employees"
                      ? "employee"
                      : modal.kind === "stores"
                        ? "store"
                        : "franchise"}
                </h2>
                <p className="muted">Keep your workspace up to date.</p>
                <form onSubmit={save}>
                  <div className="form-grid">
                    {Object.entries(fields[modal.kind])
                      .filter(
                        ([k]) => isOwner || !["salary", "due"].includes(k),
                      )
                      .map(([k, label]) => (
                        <label key={k}>
                          {label}
                          {["role", "status", "location"].includes(k) ? (
                            <select
                              name={k}
                              defaultValue={
                                modal.record?.[k] ||
                                {
                                  role: "Staff",
                                  status: "Active",
                                  location: data.stores[0]?.name,
                                }[k]
                              }
                            >
                              {(k === "role"
                                ? ["Manager", "Staff"]
                                : k === "status"
                                  ? ["Active", "Inactive"]
                                  : data.stores.map((s) => s.name)
                              ).map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              required
                              name={k}
                              type={
                                numeric.includes(k)
                                  ? "number"
                                  : k === "email"
                                    ? "email"
                                    : k === "due"
                                      ? "date"
                                      : "text"
                              }
                              min={numeric.includes(k) ? 0 : undefined}
                              step={
                                [
                                  "price",
                                  "cost",
                                  "salary",
                                  "revenue",
                                  "expenses",
                                ].includes(k)
                                  ? ".01"
                                  : undefined
                              }
                              defaultValue={
                                modal.record?.[k] ??
                                (numeric.includes(k) ? 0 : "")
                              }
                            />
                          )}
                        </label>
                      ))}
                  </div>
                  <div className="modal-actions">
                    {modal.record && (
                      <button
                        type="button"
                        className="button danger"
                        onClick={() =>
                          setModal({ ...modal, confirmDelete: true })
                        }
                      >
                        Delete
                      </button>
                    )}
                    <button
                      type="button"
                      className="button"
                      onClick={() => setModal(null)}
                    >
                      Cancel
                    </button>
                    <button className="button primary">Save changes</button>
                  </div>
                  {modal.confirmDelete && (
                    <div className="delete-confirm">
                      Delete {modal.record.name}? This cannot be undone.
                      <button
                        type="button"
                        className="button danger"
                        onClick={() => remove(modal.kind, modal.record.id)}
                      >
                        Confirm delete
                      </button>
                    </div>
                  )}
                </form>
              </>
            ) : modal.payment ? (
              <>
                <h2>Record salary payment</h2>
                <p>
                  Confirm that {money(modal.payment.salary)} was paid to{" "}
                  {modal.payment.name}. This records the payment and advances
                  the next due date by one month.
                </p>
                <p className="muted">Lobstore does not transfer money.</p>
                <button
                  className="button primary"
                  onClick={() => {
                    pay(modal.payment);
                    setModal(null);
                  }}
                >
                  Confirm payment
                </button>
              </>
            ) : modal.logs ? (
              <>
                <h2>Activity log</h2>
                <div className="log-list">
                  {data.activity.map((a) => (
                    <div key={a.id}>
                      <p>{a.text}</p>
                      <small>{a.time}</small>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2>Your account</h2>
                <p>
                  {user?.name} · {role}
                </p>
                <button
                  className="button danger"
                  onClick={async () => {
                    try {
                      await api("/auth/logout", { method: "POST" });
                    } catch (e) {
                      notify(e.message);
                      return;
                    }
                    sessionStorage.removeItem("lob-user");
                    setUser(null);
                    setDemo(true);
                    setData(demoWorkspace());
                    setModal(null);
                    navigate("Overview");
                  }}
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {auth && (
        <div className="auth-screen">
          <button
            className="auth-back text-button"
            onClick={() => setAuth(null)}
          >
            ← Back to workspace
          </button>
          <a className="brand">
            <span className="logo">
              <Box size={22} />
            </span>
            Lobstore.
          </a>
          <div className="auth-card">
            <h1>
              {auth === "login" ? "Welcome back." : "Create a workspace."}
            </h1>
            <p>
              {auth === "login"
                ? "Sign in to your Lobstore workspace."
                : "Start with an empty business workspace."}
            </p>
            <AuthForm
              mode={auth}
              api={api}
              onSuccess={(u) => {
                sessionStorage.setItem("lob-user", JSON.stringify(u));
                setData(emptyWorkspace());
                setStore("All stores");
                setRead([]);
                setUser(u);
                setDemo(false);
                setAuth(null);
                navigate("Overview");
              }}
            />
            <div className="auth-switch">
              {auth === "login"
                ? "New to Lobstore?"
                : "Already have an account?"}{" "}
              <button
                onClick={() => setAuth(auth === "login" ? "signup" : "login")}
              >
                {auth === "login" ? "Create an account" : "Sign in"}
              </button>
            </div>
            <div className="auth-demo">
              <button className="text-button" onClick={() => setAuth(null)}>
                Explore the demo workspace <ArrowRight size={14} />
              </button>
            </div>
          </div>
          <span className="auth-bottom">A workspace for store records.</span>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
