import { Link, Route, Routes } from 'react-router'
import Account from './account/Account.tsx'
import Book from './book/Book.tsx'
import EntryScreen from './entry/Entry.tsx'
import { EditEntry, NewEntry } from './form/EntryForm.tsx'
import Where from './where/Where.tsx'

// The Book is the landing place and the hub. Every other screen carries a
// back control to its parent. The entry screens, Account and Where you have
// been are drawn; the Atlas is a placeholder so far.

interface Back {
  to: string
  label: string
}

function Screen({ title, back }: { title: string; back: Back }) {
  return (
    <main className="screen">
      <header className="screen-header">
        <Link className="back" to={back.to}>‹ {back.label}</Link>
        <h1 className="screen-title">{title}</h1>
      </header>
      <p className="screen-note">Placeholder</p>
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Book />} />
      <Route path="/account" element={<Account />} />
      <Route path="/where-you-have-been" element={<Where />} />
      <Route
        path="/atlas"
        element={<Screen title="The Atlas" back={{ to: '/where-you-have-been', label: 'Where you have been' }} />}
      />
      <Route path="/entries/new" element={<NewEntry />} />
      <Route path="/entries/:id" element={<EntryScreen />} />
      <Route path="/entries/:id/edit" element={<EditEntry />} />
    </Routes>
  )
}

export default App
