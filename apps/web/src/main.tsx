import { render } from 'preact'
import { App } from './app.js'
import { start } from './store.js'
import './styles.css'

render(<App />, document.getElementById('app')!)
start()
