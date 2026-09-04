import Counter from './components/Counter'
import ItemList from './components/ItemList'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>Interactive Components</h1>
        <p>A Counter and an Item List built with React + TypeScript + Vite.</p>
      </header>
      <main className="app__main">
        <section className="app__section" aria-labelledby="counter-heading">
          <h2 id="counter-heading">Counter</h2>
          <Counter />
        </section>
        <section className="app__section" aria-labelledby="item-list-heading">
          <h2 id="item-list-heading">Item List</h2>
          <ItemList />
        </section>
      </main>
    </div>
  )
}

export default App