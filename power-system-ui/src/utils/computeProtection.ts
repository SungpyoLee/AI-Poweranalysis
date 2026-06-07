/**
 * Protection coordination computation — IEC 62271-100
 * Pure function shared by ResultsPanel and generatePDF.
 */
import type { Node, Edge } from 'reactflow'
import type { NodeData, EdgeData, Bus, Breaker, ShortCircuitResults, ProtectionItem } from '../types'

export function computeProtectionItems(
  shortcircuit: ShortCircuitResults | null,
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): ProtectionItem[] {
  if (!shortcircuit) return []
  const breakerNodes = nodes.filter(n => n.type === 'breaker')
  if (breakerNodes.length === 0) return []

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const results: ProtectionItem[] = []

  for (const breakerNode of breakerNodes) {
    const br = breakerNode.data.equipment as Breaker

    let targetBusId: string | undefined
    let ikss_ka = 0
    let ip_ka   = 0

    // Priority 1: explicit protectedBusId
    if (br.protectedBusId && shortcircuit.buses[br.protectedBusId]) {
      const sc = shortcircuit.buses[br.protectedBusId]
      if (sc.ikss_ka > 0) {
        targetBusId = br.protectedBusId
        ikss_ka     = sc.ikss_ka
        ip_ka       = sc.ip_ka
      }
    }

    // Priority 2: max Ik" among directly connected buses
    if (!targetBusId) {
      const connectedBusIds = edges
        .filter(e => e.source === breakerNode.id || e.target === breakerNode.id)
        .flatMap(e => [e.source, e.target])
        .filter(id => id !== breakerNode.id && nodeMap.get(id)?.type === 'bus')

      for (const busId of connectedBusIds) {
        const sc = shortcircuit.buses[busId]
        if (sc && sc.ikss_ka > ikss_ka) {
          targetBusId = busId
          ikss_ka     = sc.ikss_ka
          ip_ka       = sc.ip_ka
        }
      }
    }

    if (!targetBusId || ikss_ka === 0) continue

    const busNode = nodeMap.get(targetBusId)
    const busEq   = busNode?.data.equipment as Bus | undefined

    const breaking_margin_percent =
      ((br.breaking_capacity_ka - ikss_ka) / br.breaking_capacity_ka) * 100
    const making_margin_percent =
      ((br.making_capacity_ka - ip_ka) / br.making_capacity_ka) * 100
    const pass_breaking = ikss_ka <= br.breaking_capacity_ka
    const pass_making   = ip_ka   <= br.making_capacity_ka

    results.push({
      breakerId:               breakerNode.id,
      breakerName:             br.name,
      busId:                   targetBusId,
      busName:                 busEq?.name ?? targetBusId,
      busVn_kv:                busEq?.vn_kv ?? 0,
      ikss_ka,
      ip_ka,
      breaking_capacity_ka:    br.breaking_capacity_ka,
      making_capacity_ka:      br.making_capacity_ka,
      breaking_margin_percent,
      making_margin_percent,
      pass_breaking,
      pass_making,
      pass: pass_breaking && pass_making,
    })
  }

  return results
}
