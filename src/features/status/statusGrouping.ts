export type StatusItem = {
  id: string
  userId: string
  caption: string | null
  mediaPath: string | null
  bgColor: string | null
  createdAt: string
  expiresAt: string
  viewed: boolean
}

export type StatusOwner = {
  userId: string
  displayName: string
  avatarPath: string | null
}

export type StatusGroup = StatusOwner & {
  isMine: boolean
  /** Oldest first, the order they are played in. */
  items: StatusItem[]
  viewedCount: number
  latestAt: string
}

/**
 * Groups statuses per person. My own group is separate, and other people are ordered with unseen updates
 * first (then by most recent), matching the "Recent updates" / "Viewed updates" split.
 */
export function groupStatuses(
  items: Array<StatusItem & { owner: StatusOwner }>,
  me: string,
  now = Date.now(),
): { mine: StatusGroup | null; recent: StatusGroup[]; viewed: StatusGroup[] } {
  const groups = new Map<string, StatusGroup>()
  for (const { owner, ...item } of items) {
    if (new Date(item.expiresAt).getTime() <= now) continue
    const existing = groups.get(owner.userId)
    if (existing) {
      existing.items.push(item)
      if (item.viewed) existing.viewedCount++
      if (item.createdAt > existing.latestAt) existing.latestAt = item.createdAt
    } else {
      groups.set(owner.userId, {
        ...owner,
        isMine: owner.userId === me,
        items: [item],
        viewedCount: item.viewed ? 1 : 0,
        latestAt: item.createdAt,
      })
    }
  }
  for (const group of groups.values())
    group.items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const others = Array.from(groups.values())
    .filter((group) => !group.isMine)
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
  return {
    mine: groups.get(me) ?? null,
    recent: others.filter((group) => group.viewedCount < group.items.length),
    viewed: others.filter((group) => group.viewedCount >= group.items.length),
  }
}

/** Index of the first status not yet seen, so a viewer resumes where the person left off. */
export function firstUnviewedIndex(group: StatusGroup): number {
  const index = group.items.findIndex((item) => !item.viewed)
  return index === -1 ? 0 : index
}
