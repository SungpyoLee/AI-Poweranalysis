import axios from 'axios'

// Vite proxies /loadflow and /shortcircuit → http://127.0.0.1:8000
const api = axios.create({ baseURL: '' })

// Strip frontend-only fields before sending to backend
function apiPayload(network) {
  // eslint-disable-next-line no-unused-vars
  const { circuit_breakers, ...rest } = network
  return rest
}

export const runLoadflow = (network) =>
  api.post('/loadflow/run', apiPayload(network)).then((r) => r.data)

export const runShortcircuit = (network) =>
  api.post('/shortcircuit/run', apiPayload(network)).then((r) => r.data)

export const runShortcircuitCycles = (network) =>
  api.post('/shortcircuit/cycles', apiPayload(network)).then((r) => r.data)
