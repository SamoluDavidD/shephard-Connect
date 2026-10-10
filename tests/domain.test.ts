import { describe, expect, it } from "vitest"
import {
  canAccessEngagement,
  canTransitionRequest,
  safeNotification,
} from "../src/domain"

describe("counseling request state model", () => {
  it("allows only approved transitions from Pending", () => {
    expect(canTransitionRequest("Pending", "Accepted")).toBe(true)
    expect(canTransitionRequest("Pending", "Cancelled")).toBe(true)
    expect(canTransitionRequest("Pending", "Closed")).toBe(false)
  })

  it("treats declined, cancelled, expired, and closed requests as terminal", () => {
    expect(canTransitionRequest("Declined", "Pending")).toBe(false)
    expect(canTransitionRequest("Cancelled", "Accepted")).toBe(false)
    expect(canTransitionRequest("Expired", "Accepted")).toBe(false)
    expect(canTransitionRequest("Closed", "Accepted")).toBe(false)
  })
})

describe("engagement object authorization", () => {
  const engagement = { seekerId: "seeker-1", counselorUserId: "counselor-1" }

  it("allows only the assigned seeker and counselor", () => {
    expect(canAccessEngagement("seeker-1", engagement)).toBe(true)
    expect(canAccessEngagement("counselor-1", engagement)).toBe(true)
    expect(canAccessEngagement("other-counselor", engagement)).toBe(false)
    expect(canAccessEngagement("admin", engagement)).toBe(false)
  })
})

describe("safe notifications", () => {
  it("does not include message or counseling content", () => {
    expect(safeNotification("Counseling update", "SC-1234")).toEqual({
      title: "Counseling update",
      body: "There is an update for request SC-1234.",
    })
  })
})
