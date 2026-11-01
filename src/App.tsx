import type { ReactNode } from 'react'
import { Link, Route, Routes, useParams } from 'react-router'
import Book from './book/Book.tsx'

// The Book is the landing place and the hub. Every other screen carries a
// back control to its parent; they are placeholders so far.

interface Back {
  to: string
  label: string
}

function Screen({ title, back, children }: { title: string; back: Back; children?: ReactNode }) {
  return (
    <main className="screen">
      <header className="screen-header">
        <Link className="back" to={back.to}>‹ {back.label}</Link>
        <h1 className="screen-title">{title}</h1>
      </header>
      <p className="screen-note">Placeholder</p>
      {children && <ul className="screen-links">{children}</ul>}
    </main>
  )
}

function EditEntry() {
  const { id } = useParams()
  return <Screen title="Edit entry" back={{ to: `/entries/${id}`, label: 'Entry' }} />
}

const BOOK: Back = { to: '/', label: 'The Book' }

function App() {
  return (
    <Routes>
      <Route path="/" element={<Book />} />
      <Route path="/account" element={<Screen title="Account" back={BOOK} />} />
      <Route
        path="/where-you-have-been"
        element={
          <Screen title="Where you have been" back={BOOK}>
            <li><Link to="/atlas">The Atlas</Link></li>
          </Screen>
        }
      />
      <Route
        path="/atlas"
        element={<Screen title="The Atlas" back={{ to: '/where-you-have-been', label: 'Where you have been' }} />}
      />
      <Route path="/entries/new" element={<Screen title="New entry" back={BOOK} />} />
      <Route path="/entries/:id" element={<Screen title="Entry" back={BOOK} />} />
      <Route path="/entries/:id/edit" element={<EditEntry />} />
    </Routes>
  )
}

export default App
