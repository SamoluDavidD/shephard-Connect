export type Role = "seeker" | "counselor" | "admin"

export const needs = [
  {
    title: "Prayer & spiritual growth",
    note: "Prayer, faith, and drawing closer to God",
  },
  {
    title: "Relationships / marriage",
    note: "Conflict, dating, family, and marriage",
  },
  {
    title: "Bible questions",
    note: "Understand Scripture with a trusted guide",
  },
  { title: "School / career", note: "Discernment, purpose, study, and work" },
  { title: "Personal growth", note: "Habits, character, and life direction" },
  { title: "Other", note: "Something not listed here" },
]

export const counselors = [
  {
    id: "sarah",
    name: "Sarah K.",
    initials: "SK",
    title: "Biblical Counselor & Discipler",
    bio: "Helps young adults grow in prayer, Scripture, and their relationship with Christ.",
    areas: ["Prayer", "Spiritual growth", "Relationships"],
    language: "English, Kpelle",
    availability: "Available this week",
    youth: true,
    color: "mint",
  },
  {
    id: "john",
    name: "John D.",
    initials: "JD",
    title: "Marriage & Young Adults Counselor",
    bio: "Walks alongside individuals and couples with Biblical wisdom and practical next steps.",
    areas: ["Relationships", "Marriage", "Career"],
    language: "English, Bassa",
    availability: "Replies in 1–2 days",
    youth: false,
    color: "gold",
  },
  {
    id: "mary",
    name: "Mary T.",
    initials: "MT",
    title: "Bible Study & Discipleship Guide",
    bio: "Supports seekers with Bible questions and a steady path toward everyday spiritual growth.",
    areas: ["Bible study", "Discipleship", "Personal growth"],
    language: "English, Kru",
    availability: "Available this week",
    youth: true,
    color: "blue",
  },
]

export const journeyStages = [
  { name: "Come", detail: "Understand available support and choose a path." },
  {
    name: "Connect",
    detail: "Connect with an approved counselor or prayer path.",
  },
  { name: "Counsel", detail: "Begin a private, caring conversation." },
  {
    name: "Follow Up",
    detail: "Agree on the next contact or faithful action.",
  },
  { name: "Disciple", detail: "Voluntarily begin ongoing discipleship." },
  { name: "Grow", detail: "Continue through approved growth activities." },
]
