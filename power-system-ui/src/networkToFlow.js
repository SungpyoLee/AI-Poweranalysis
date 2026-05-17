// ── Tree-based auto-layout ──────────────────────────────────────────────────
function buildTreePositions(network) {
  if (network.buses.length === 0) return {}

  // Adjacency list (bidirectional)
  const adj = {}
  network.buses.forEach((b) => { adj[b.id] = [] })
  network.transformers.forEach((t) => {
    adj[t.hv_bus_id].push(t.lv_bus_id)
    adj[t.lv_bus_id].push(t.hv_bus_id)
  })
  network.lines.forEach((l) => {
    adj[l.from_bus_id].push(l.to_bus_id)
    adj[l.to_bus_id].push(l.from_bus_id)
  })

  // Root = slack bus (external grid), or highest-voltage bus
  const rootId =
    network.external_grids[0]?.bus_id ??
    network.buses.slice().sort((a, b) => b.vn_kv - a.vn_kv)[0].id

  // BFS → parent-child tree
  const children = {}
  network.buses.forEach((b) => { children[b.id] = [] })
  const visited = new Set([rootId])
  const depth = { [rootId]: 0 }
  const queue = [rootId]

  while (queue.length > 0) {
    const id = queue.shift()
    for (const nid of adj[id] ?? []) {
      if (!visited.has(nid)) {
        visited.add(nid)
        children[id].push(nid)
        depth[nid] = depth[id] + 1
        queue.push(nid)
      }
    }
  }

  // Post-order x assignment (Reingold–Tilford simplified)
  const X_GAP = 400
  const Y_GAP = 300
  const positions = {}
  let leaf = 0

  function assignX(id, d) {
    const kids = children[id]
    if (kids.length === 0) {
      const x = leaf++ * X_GAP + 80
      positions[`bus-${id}`] = { x, y: d * Y_GAP + 100 }
      return x
    }
    const xs = kids.map((c) => assignX(c, d + 1))
    const x = (Math.min(...xs) + Math.max(...xs)) / 2
    positions[`bus-${id}`] = { x, y: d * Y_GAP + 100 }
    return x
  }

  assignX(rootId, 0)

  // Disconnected buses: row at the bottom
  const maxD = Math.max(...Object.values(depth), 0)
  network.buses
    .filter((b) => !visited.has(b.id))
    .forEach((b, i) => {
      positions[`bus-${b.id}`] = { x: 80 + i * X_GAP, y: (maxD + 2) * Y_GAP + 100 }
    })

  return positions
}

// ── Edge helper ────────────────────────────────────────────────────────────
function mkEdge(id, src, tgt, color, opts = {}) {
  return {
    id,
    source: src,
    target: tgt,
    type: 'straight',
    style: { stroke: color, strokeWidth: 2.2 },
    ...opts,
  }
}

// ── Main export ────────────────────────────────────────────────────────────
export function networkToFlow(network, positions, loadflowResult, scResult, cyclesResult) {
  const nodes = []
  const edges = []

  const cbs = network.circuit_breakers ?? []
  const getPos = (id, def) => positions[id] ?? def

  // Compute tree layout for default positions
  const treePos = buildTreePositions(network)
  const busPos  = (id) => positions[`bus-${id}`] ?? treePos[`bus-${id}`] ?? { x: 80, y: 100 }

  // ── Bus nodes ────────────────────────────────────────────────────────────
  network.buses.forEach((bus) => {
    const pos         = getPos(`bus-${bus.id}`, treePos[`bus-${bus.id}`] ?? { x: 80, y: 100 })
    const busResult   = loadflowResult?.buses.find((b) => b.bus_id === bus.id)
    const busSc       = scResult?.buses.find((b) => b.bus_id === bus.id)
    const busCycles   = cyclesResult?.buses.find((b) => b.bus_id === bus.id)

    nodes.push({
      id: `bus-${bus.id}`,
      type: 'bus',
      position: pos,
      data: { bus, result: busResult, sc: busSc, cycles: busCycles },
    })
  })

  // ── External grid nodes ──────────────────────────────────────────────────
  const egCount = {}
  network.external_grids.forEach((eg, i) => {
    const bp  = busPos(eg.bus_id)
    const cnt = egCount[eg.bus_id] ?? 0
    egCount[eg.bus_id] = cnt + 1
    const def = { x: bp.x - 33 + cnt * 90, y: bp.y - 140 }

    nodes.push({ id: `eg-${i}`, type: 'extgrid', position: getPos(`eg-${i}`, def), data: { eg } })
    edges.push(mkEdge(`eg-edge-${i}`, `eg-${i}`, `bus-${eg.bus_id}`, '#2040a0', {
      sourceHandle: 'bottom', targetHandle: 'top',
    }))
  })

  // ── Load nodes ───────────────────────────────────────────────────────────
  const loadCount = {}
  network.loads.forEach((load, i) => {
    const bp  = busPos(load.bus_id)
    const cnt = loadCount[load.bus_id] ?? 0
    loadCount[load.bus_id] = cnt + 1
    const def = { x: bp.x - 29 + cnt * 110, y: bp.y + 50 }

    nodes.push({ id: `load-${i}`, type: 'load', position: getPos(`load-${i}`, def), data: { load } })
    edges.push(mkEdge(`load-edge-${i}`, `bus-${load.bus_id}`, `load-${i}`, '#7a3000', {
      sourceHandle: 'bottom', targetHandle: 'top',
    }))
  })

  // ── Generator nodes ──────────────────────────────────────────────────────
  const genCount = {}
  network.generators.forEach((gen, i) => {
    const bp  = busPos(gen.bus_id)
    const cnt = genCount[gen.bus_id] ?? 0
    genCount[gen.bus_id] = cnt + 1
    const def = { x: bp.x + 80 + cnt * 110, y: bp.y + 50 }

    nodes.push({ id: `gen-${i}`, type: 'generator', position: getPos(`gen-${i}`, def), data: { gen } })
    edges.push(mkEdge(`gen-edge-${i}`, `bus-${gen.bus_id}`, `gen-${i}`, '#005a20', {
      sourceHandle: 'bottom', targetHandle: 'top',
    }))
  })

  // ── Transformer nodes + CBs ──────────────────────────────────────────────
  network.transformers.forEach((trafo, i) => {
    const trafoResult = loadflowResult?.transformers.find((t) => t.trafo_name === trafo.name)
    const hvP = busPos(trafo.hv_bus_id)
    const lvP = busPos(trafo.lv_bus_id)

    const trafoId  = `trafo-${i}`
    const trafoX   = (hvP.x + lvP.x) / 2 - 30
    const trafoY   = (hvP.y + lvP.y) / 2 - 48
    const trafoDef = { x: trafoX, y: trafoY }

    nodes.push({
      id: trafoId,
      type: 'transformer',
      position: getPos(trafoId, trafoDef),
      data: { trafo, result: trafoResult },
    })

    const cbHV = cbs.find((c) => c.on === 'trafo' && c.ref === trafo.name && c.terminal === 'hv')
    const cbLV = cbs.find((c) => c.on === 'trafo' && c.ref === trafo.name && c.terminal === 'lv')
    const EDGE_COLOR = '#5a1090'

    // HV side: bus → [CB] → trafo
    if (cbHV) {
      const cbId  = `cb-${cbHV.id}`
      const cbDef = { x: hvP.x - 4, y: hvP.y + (trafoY - hvP.y) * 0.42 }
      nodes.push({ id: cbId, type: 'cb', position: getPos(cbId, cbDef), data: { cb: cbHV } })
      edges.push(mkEdge(`${trafoId}-hv-bus-cb`, `bus-${trafo.hv_bus_id}`, cbId, EDGE_COLOR, { sourceHandle: 'bottom', targetHandle: 'top' }))
      edges.push(mkEdge(`${trafoId}-hv-cb-tr`,  cbId, trafoId, EDGE_COLOR, { sourceHandle: 'bottom', targetHandle: 'top' }))
    } else {
      edges.push(mkEdge(`${trafoId}-hv`, `bus-${trafo.hv_bus_id}`, trafoId, EDGE_COLOR, { targetHandle: 'top' }))
    }

    // LV side: trafo → [CB] → bus
    const trafoBottom = getPos(trafoId, trafoDef).y + 84
    if (cbLV) {
      const cbId  = `cb-${cbLV.id}`
      const cbDef = { x: lvP.x - 4, y: trafoBottom + (lvP.y - trafoBottom) * 0.45 }
      nodes.push({ id: cbId, type: 'cb', position: getPos(cbId, cbDef), data: { cb: cbLV } })
      edges.push(mkEdge(`${trafoId}-lv-tr-cb`,  trafoId, cbId, EDGE_COLOR, { sourceHandle: 'bottom', targetHandle: 'top' }))
      edges.push(mkEdge(`${trafoId}-lv-cb-bus`, cbId, `bus-${trafo.lv_bus_id}`, EDGE_COLOR, { sourceHandle: 'bottom', targetHandle: 'top' }))
    } else {
      edges.push(mkEdge(`${trafoId}-lv`, trafoId, `bus-${trafo.lv_bus_id}`, EDGE_COLOR, { sourceHandle: 'bottom' }))
    }
  })

  // ── Line edges + CBs ─────────────────────────────────────────────────────
  network.lines.forEach((line, i) => {
    const lineResult = loadflowResult?.lines.find((l) => l.line_name === line.name)
    const loading    = lineResult?.loading_percent ?? null
    const lineColor  =
      loading === null ? '#203860'
      : loading > 90   ? '#900000'
      : loading > 70   ? '#7a5000'
      : '#005a20'

    const cbLine = cbs.find((c) => c.on === 'line' && c.ref === line.name)
    const fromP  = busPos(line.from_bus_id)
    const toP    = busPos(line.to_bus_id)

    const label      = loading !== null ? `${line.name}  ${loading.toFixed(1)}%` : line.name
    const labelStyle = { fill: '#1a2838', fontSize: 10, fontFamily: "'Consolas','Courier New',monospace" }
    const labelBgStyle  = { fill: '#eef4ff', fillOpacity: 0.92 }
    const labelBgPadding = [4, 2]

    if (cbLine) {
      const cbId  = `cb-${cbLine.id}`
      // Place CB 28% of the way from source bus
      const cbDef = {
        x: fromP.x + (toP.x - fromP.x) * 0.28 - 4,
        y: fromP.y + (toP.y - fromP.y) * 0.28,
      }
      nodes.push({ id: cbId, type: 'cb', position: getPos(cbId, cbDef), data: { cb: cbLine } })
      // bus → CB (no label)
      edges.push(mkEdge(`line-${i}-from`, `bus-${line.from_bus_id}`, cbId, lineColor, { sourceHandle: 'right', targetHandle: 'top' }))
      // CB → bus (label on this segment)
      edges.push(mkEdge(`line-${i}-to`, cbId, `bus-${line.to_bus_id}`, lineColor, {
        sourceHandle: 'bottom', targetHandle: 'top',
        label, labelStyle, labelBgStyle, labelBgPadding,
      }))
    } else {
      edges.push(mkEdge(`line-${i}`, `bus-${line.from_bus_id}`, `bus-${line.to_bus_id}`, lineColor, {
        label, labelStyle, labelBgStyle, labelBgPadding,
      }))
    }
  })

  // ── Free-standing CB nodes (no line/trafo ref, just bus-based) ───────────
  cbs
    .filter((c) => !c.on || c.on === 'bus')
    .forEach((cb) => {
      const cbId = `cb-${cb.id}`
      if (!nodes.find((n) => n.id === cbId)) {
        const bp  = cb.bus_id ? busPos(cb.bus_id) : { x: 200, y: 200 }
        const def = { x: bp.x + 40, y: bp.y - 40 }
        nodes.push({ id: cbId, type: 'cb', position: getPos(cbId, def), data: { cb } })
      }
    })

  return { nodes, edges }
}
