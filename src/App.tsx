import type { ReactNode } from 'react'
import { Link, Route, Routes } from 'react-router'

// Placeholder screens. The Book is the landing place and the hub.

function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="screen">
      <h1 className="screen-title">{title}</h1>
      <p className="screen-note">Placeholder</p>
      {children && <ul className="screen-links">{children}</ul>}
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Screen title="The Book">
            <li><Link to="/where-you-have-been">Where you have been</Link></li>
            <li><Link to="/account">Account</Link></li>
          </Screen>
        }
      />
      <Route path="/account" element={<Screen title="Account" />} />
      <Route
        path="/where-you-have-been"
        element={
          <Screen title="Where you have been">
            <li><Link to="/atlas">The Atlas</Link></li>
          </Screen>
        }
      />
      <Route path="/atlas" element={<Screen title="The Atlas" />} />
      <Route path="/entries/new" element={<Screen title="New entry" />} />
      <Route path="/entries/:id" element={<Screen title="Entry" />} />
      <Route path="/entries/:id/edit" element={<Screen title="Edit entry" />} />
    </Routes>
  )
}

export default App
