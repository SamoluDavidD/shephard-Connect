export type RequestStatus = "Pending" | "Accepted" | "Declined" | "Cancelled" | "Expired" | "Closed"

const transitions: Record<RequestStatus, RequestStatus[]> = {
  Pending: ["Accepted", "Declined", "Cancelled", "Expired"],
  Accepted: ["Closed"],
  Declined: [],
  Cancelled: [],
  Expired: [],
  Closed: [],
}

export function canTransitionRequest(from: RequestStatus, to: RequestStatus) {
  return transitions[from].includes(to)
}

export function canAccessEngagement(
  userId: string,
  engagement: { seekerId: string; counselorUserId: string },
) {
  return userId === engagement.seekerId || userId === engagement.counselorUserId
}

export function safeNotification(title: string, reference?: string) {
  return {
    title: title.slice(0, 80),
    body: reference
      ? `There is an update for request ${reference}.`
      : "There is an update in ShepherdConnect.",
  }
}
