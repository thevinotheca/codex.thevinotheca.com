import { Route, Routes } from 'react-router'
import Account from './account/Account.tsx'
import Atlas from './atlas/Atlas.tsx'
import Book from './book/Book.tsx'
import Collection from './collection/Collection.tsx'
import EntryScreen from './entry/Entry.tsx'
import { EditEntry, NewEntry } from './form/EntryForm.tsx'
import Where from './where/Where.tsx'

// The Book is the landing place and the hub. Every other screen carries a
// back control to its parent in its header, save the Atlas, which is full
// screen and floats its back control over the map.

function App() {
  return (
    <Routes>
      <Route path="/" element={<Book />} />
      <Route path="/account" element={<Account />} />
      <Route path="/where-you-have-been" element={<Where />} />
      <Route path="/atlas" element={<Atlas />} />
      <Route path="/collection" element={<Collection />} />
      <Route path="/entries/new" element={<NewEntry />} />
      <Route path="/entries/:id" element={<EntryScreen />} />
      <Route path="/entries/:id/edit" element={<EditEntry />} />
    </Routes>
  )
}

export default App
