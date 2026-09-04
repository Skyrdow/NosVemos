import { Link, Route, Routes, useLocation } from 'react-router-dom'
import CreateMeeting from './pages/CreateMeeting'
import JoinMeeting from './pages/JoinMeeting'
import './App.css'

function NotFound() {
  return (
    <section className="join join--empty">
      <h2>Página no encontrada</h2>
      <p>El enlace no existe o fue movido.</p>
      <Link className="btn" to="/">
        Crear una reunión
      </Link>
    </section>
  )
}

function App() {
  const { pathname } = useLocation()
  return (
    <div className="app">
      <header className="app__header">
        <Link to="/" className="app__brand">
          NosVemos
        </Link>
        <p className="app__tagline">
          Coordinen una reunión: cada uno marca sus horas libres y la app
          encuentra cuándo coinciden.
        </p>
      </header>
      <main className="app__main">
        <Routes>
          <Route path="/" element={<CreateMeeting />} />
          {/* key por pathname: cambiar de slug remonta la página */}
          <Route path="/m/:slug" element={<JoinMeeting key={slugOf(pathname)} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="app__footer">
        <p>NosVemos · disponibilidad por link único</p>
      </footer>
    </div>
  )
}

function slugOf(pathname: string): string {
  const match = /^\/m\/([^/]+)/.exec(pathname)
  return match?.[1] ?? pathname
}

export default App