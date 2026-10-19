import { useEffect, useState } from 'react'
import './App.css'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'

const API = import.meta.env.VITE_API_URL || "http://localhost:8000"



function App() {
  const [loading, setLoading] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [username, setUsername] = useState("")
  const [authMode, setAuthMode] = useState("login")
  const [authForm, setAuthForm] = useState({ username: "", password: "" })
  const [authError, setAuthError] = useState("")
  const [authSuccess, setAuthSuccess] = useState("")
  const [authLoading, setAuthLoading] = useState(false)

  const [data, setData] = useState({ title: "", completed: false })
  const [all_product, setAll_product] = useState([])
  const [filter, setFilter] = useState("all")
  const [itemError, setItemError] = useState("")
  const [adding, setAdding] = useState(false)
  const [clearing, setClearing] = useState(false)

  // ----------------- Google Login -----------------
  const handleGoogleSuccess = async (tokenResponse) => {
    setAuthError("")
    setAuthLoading(true)

    try {
      const res = await fetch(`${API}/google_login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          access_token: tokenResponse.access_token,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.detail || "Google authentication failed")
      }

      setUsername(result.username || result.email)
      localStorage.setItem("todo_username", result.username || result.email)

      setLoggedIn(true)
      setFilter("all")
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const googleLogin = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => setAuthError("Google login failed"),
  })



  const fetchItems = (activeFilter = "all") => {
    let endpoint = "/"
    if (activeFilter === "active") endpoint = "/active"
    else if (activeFilter === "completed") endpoint = "/completed"

    return fetch(`${API}${endpoint}`, { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          setLoggedIn(false)
          setUsername("")
          throw new Error("unauthorized")
        }
        if (!res.ok) throw new Error("Failed to fetch items")
        return res.json()
      })
      .then((data) => setAll_product(data))
      .catch((err) => {
        if (err.message !== "unauthorized") {
          setItemError(err.message)
        }
        throw err
      })
  }

  useEffect(() => {
    fetch(`${API}/`, { credentials: "include" })
      .then((res) => {
        if (res.ok) {
          return res.json().then((data) => {
            setAll_product(data)
            setLoggedIn(true)
            const saved = localStorage.getItem("todo_username")
            if (saved) setUsername(saved)
          })
        }
        return null
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (loggedIn && !loading) {
      fetchItems(filter).catch(() => {})
    }
  }, [loggedIn, filter, loading])

  const handleAuthSubmit = (e) => {
    e.preventDefault()
    setAuthError("")
    setAuthSuccess("")
    setAuthLoading(true)

    const endpoint = authMode === "login" ? "/login" : "/user"
    fetch(`${API}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(authForm),
    })
      .then(async (res) => {
        const text = await res.text()
        let parsed
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = { detail: text }
        }
        if (!res.ok) throw new Error(parsed.detail || `Request failed (${res.status})`)
        return parsed
      })
      .then(() => {
        if (authMode === "login") {
          setUsername(authForm.username)
          localStorage.setItem("todo_username", authForm.username)
          setLoggedIn(true)
          setAuthForm({ username: "", password: "" })
          setFilter("all")
        } else {
          setAuthSuccess("Account created! Please sign in.")
          setAuthMode("login")
          setAuthError("")
        }
      })
      .catch((err) => setAuthError(err.message))
      .finally(() => setAuthLoading(false))
  }

  const handleLogout = () => {
    fetch(`${API}/logout`, {
      method: "POST",
      credentials: "include",
    })
      .catch(() => {})
      .finally(() => {
        localStorage.removeItem("todo_username")
        setLoggedIn(false)
        setUsername("")
        setAll_product([])
        setFilter("all")
      })
  }

  const addItem = () => {
    if (!data.title.trim() || adding) return
    setItemError("")
    setAdding(true)
    fetch(`${API}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    })
      .then((res) => {
        if (res.status === 401) {
          setLoggedIn(false)
          throw new Error("unauthorized")
        }
        if (!res.ok) throw new Error("Failed to add item")
        return res.json()
      })
      .then((res) => {
        setAll_product([...all_product, res.item])
        setData({ title: "", completed: false })
      })
      .catch((err) => {
        if (err.message !== "unauthorized") setItemError(err.message)
      })
      .finally(() => setAdding(false))
  }

  const toggleItem = (id) => {
    setItemError("")
    fetch(`${API}/${id}`, {
      method: "PUT",
      credentials: "include",
    })
      .then((res) => {
        if (res.status === 401) {
          setLoggedIn(false)
          throw new Error("unauthorized")
        }
        if (!res.ok) throw new Error("Failed to update item")
        return res.json()
      })
      .then((res) => {
        setAll_product((prev) =>
          prev.map((it) =>
            it.id === res.item.id ? { ...it, completed: res.item.completed } : it
          )
        )
      })
      .catch((err) => {
        if (err.message !== "unauthorized") setItemError(err.message)
      })
  }

  const deleteItem = (id) => {
    setItemError("")
    fetch(`${API}/${id}`, {
      method: "DELETE",
      credentials: "include",
    })
      .then((res) => {
        if (res.status === 401) {
          setLoggedIn(false)
          throw new Error("unauthorized")
        }
        if (!res.ok) throw new Error("Failed to delete item")
        return res.json()
      })
      .then(() => {
        setAll_product((prev) => prev.filter((it) => it.id !== id))
      })
      .catch((err) => {
        if (err.message !== "unauthorized") setItemError(err.message)
      })
  }

  const clearCompleted = () => {
    const completed = all_product.filter((it) => it.completed)
    if (completed.length === 0 || clearing) return
    setClearing(true)
    Promise.all(completed.map((it) =>
      fetch(`${API}/${it.id}`, { method: "DELETE", credentials: "include" })
    )).then(() => {
      setAll_product((prev) => prev.filter((it) => !it.completed))
    }).finally(() => setClearing(false))
  }

  if (loading) {
    return (
      <main className="login-app">
        <div className="login-card">
          <p className="auth-success" style={{ textAlign: "center" }}>Loading...</p>
        </div>
      </main>
    )
  }

  if (!loggedIn) {
    return (
      <main className="login-app">
        <div className="login-card">
          <header className="login-header">
            <div className="login-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h1>{authMode === "login" ? "Welcome back" : "Create account"}</h1>
            <p>
              {authMode === "login"
                ? "Sign in to your account to continue"
                : "Register a new account to get started"}
            </p>
          </header>

          <form className="login-form" onSubmit={handleAuthSubmit}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                className="login-input"
                placeholder="Enter username"
                value={authForm.username}
                onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="password">Password</label>
                {authMode === "login" && (
                  <a href="#" className="forgot-link">Forgot password?</a>
                )}
              </div>
              <input
                id="password"
                type="password"
                className="login-input"
                placeholder="Enter your password"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                required
              />
            </div>

            {authError && <p className="auth-error">{authError}</p>}
            {authSuccess && <p className="auth-success">{authSuccess}</p>}

            <button type="submit" className="login-btn" disabled={authLoading}>
              {authLoading
                ? "Please wait..."
                : authMode === "login" ? "Sign in" : "Sign up"}
            </button>
          </form>

          <div className="login-divider">
            <span>or continue with</span>
          </div>

          <div className="social-row">
            <button type="button" className="social-btn" onClick={() => googleLogin()} aria-label="Google">
              <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.28 1.07-3.71 1.07-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.09H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.91l3.66-2.8z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.09l3.66 2.84c.87-2.6 3.3-4.55 6.16-4.55z" fill="#EA4335"/>
              </svg>
            </button>
          </div>

          <p className="signup-text">
            {authMode === "login" ? "Don't have an account? " : "Already have an account? "}
            <a
              href="#"
              className="signup-link"
              onClick={(e) => {
                e.preventDefault()
                setAuthMode(authMode === "login" ? "register" : "login")
                setAuthError("")
                setAuthSuccess("")
              }}
            >
              {authMode === "login" ? "Sign up" : "Sign in"}
            </a>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="todo-app">
      <header className="todo-header">
        <div className="todo-header-row">
          <div>
            <h1>My Tasks</h1>
            <p>Logged in as <strong>{username}</strong></p>
          </div>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <form className="todo-form" onSubmit={(e) => { e.preventDefault(); addItem() }}>
        <input
          type="text"
          onChange={(e) => setData((data) => ({ ...data, title: e.target.value }))}
          value={data.title}
          className="todo-input"
          placeholder="What needs to be done?"
          disabled={adding}
        />
        <button type="submit" className="add-btn" disabled={adding}>
          {adding ? "Adding..." : "Add"}
        </button>
      </form>

      {itemError && <p className="auth-error" style={{ marginTop: "12px" }}>{itemError}</p>}

      <div className="filters">
        <button
          type="button"
          className={`filter ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          type="button"
          className={`filter ${filter === "active" ? "active" : ""}`}
          onClick={() => setFilter("active")}
        >
          Active
        </button>
        <button
          type="button"
          className={`filter ${filter === "completed" ? "active" : ""}`}
          onClick={() => setFilter("completed")}
        >
          Completed
        </button>
      </div>

      <ul className="todo-list">
        {all_product?.length === 0 ? (
          <li className="todo-empty">No tasks here yet</li>
        ) : (
          all_product?.map((item) => (
            <li key={item.id} className="todo-item">
              <input
                type="checkbox"
                checked={item.completed}
                className="todo-check"
                onChange={() => toggleItem(item.id)}
              />
              <span
                className="todo-text"
                style={{ textDecoration: item.completed ? "line-through" : "" }}
              >
                {item.title}
              </span>
              <button
                onClick={() => deleteItem(item.id)}
                type="button"
                className="delete-btn"
                aria-label="Delete task"
              >
                ✕
              </button>
            </li>
          ))
        )}
      </ul>

      <footer className="todo-footer">
        <span>{all_product?.filter((i) => !i.completed).length || 0} items left</span>
        <button
          type="button"
          className="clear-btn"
          onClick={clearCompleted}
          disabled={clearing}
        >
          {clearing ? "Clearing..." : "Clear completed"}
        </button>
      </footer>
    </main>
  )
}

export default App
