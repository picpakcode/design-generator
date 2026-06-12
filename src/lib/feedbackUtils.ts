interface ApprovalLike {
  block_id: string
  author_name: string
  status: 'approved' | 'changes_requested'
  created_at: string
}

export function blockApprovalSummary(
  approvals: ApprovalLike[],
  blockId: string,
): 'approved' | 'changes_requested' | null {
  const relevant = approvals.filter(a => a.block_id === blockId)
  if (!relevant.length) return null
  const map = new Map<string, ApprovalLike>()
  for (const a of relevant) {
    const ex = map.get(a.author_name)
    if (!ex || new Date(a.created_at) > new Date(ex.created_at)) map.set(a.author_name, a)
  }
  const statuses = Array.from(map.values()).map(a => a.status)
  return statuses.includes('changes_requested') ? 'changes_requested' : 'approved'
}
