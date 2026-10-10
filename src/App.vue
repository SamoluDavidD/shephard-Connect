<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { counselors, journeyStages, needs } from "./data"
import { api, apiUrl, type AccountUser, type AuthResponse } from "./lib/api"
import { account, refreshAccount, setAccountUser } from "./lib/account"
import { useApp, type RequestStatus } from "./app/state"
import AppShell from "./components/AppShell.vue"
import Badge from "./components/Badge.vue"
import BaseButton from "./components/BaseButton.vue"
import Brand from "./components/Brand.vue"
import CounselorRegistrationForm from "./components/CounselorRegistrationForm.vue"
import Field from "./components/Field.vue"
import Icon from "./components/Icon.vue"
import Notice from "./components/Notice.vue"

const route = useRoute()
const router = useRouter()
type CounselorApplicationSummary = {
  publicRef: string
  status: string
  fullLegalName: string
  preferredDisplayName: string
  professionalTitle: string | null
  specialization: string
  submittedAt: string
  publicId: string
  accountStatus: string
}
type CounselorApplicationDocument = {
  id: string
  category: string
  status: "requested" | "uploaded"
  originalName: string | null
  mimeType: string | null
  byteSize: number | null
  uploadedAt: string | null
  requestedAt: string | null
}
type CounselorProfileDocument = {
  id: string
  category: string
  status: "requested" | "uploaded"
  original_name: string | null
  byte_size: number | null
  uploaded_at: string | null
}
type CounselorApplicationDetail = CounselorApplicationSummary & {
  updatedAt: string
  email: string
  displayName: string | null
  phone: string | null
  country: string | null
  generalLocation: string | null
  highestQualification: string | null
  institution: string | null
  qualificationType: string | null
  completionYear: number | null
  certifications: string | null
  yearsExperience: number | null
  licenseNumber: string | null
  licensingAuthority: string | null
  licenseExpiry: string | null
  biography: string | null
  areasOfExpertise: string[]
  languages: string[]
  workHistory: string | null
  referencesText: string | null
  codeOfConductAccepted: boolean
  confidentialityAccepted: boolean
  safeguardingAccepted: boolean
  qualificationVerified: boolean
  licenseVerified: boolean
  documents: CounselorApplicationDocument[]
  qualifications: Array<{
    id: string
    qualification: string
    institution: string
    qualificationType: string
    completionYear: number | null
    verificationStatus: string
    verificationNote: string | null
    verifiedAt: string | null
  }>
  reviews: Array<{
    action: string
    reason: string
    requestedDocumentCategories: string[]
    createdAt: string
    reviewerPublicId: string
    reviewerName: string | null
  }>
  responses: Array<{ message: string; created_at: string }>
}
type ApplicantApplication = {
  publicRef: string
  status: string
  submittedAt: string
  updatedAt: string
  documents: CounselorApplicationDocument[]
  informationRequests: Array<{ reason: string; created_at: string }>
}
type CounselorNotification = {
  id: string
  title: string
  message: string
  created_at: string
  read_at: string | null
}
const {
  state,
  request,
  setDemo,
  setAccessMode,
  setNeed,
  resetDemo,
  createRequest,
  updateRequest,
  sendMessage,
  toggleResource,
  setJourneyStage,
} = useApp()

const selectedCounselor = computed(
  () =>
    displayedCounselors.value.find(
      (item) => item.id === route.params.id || item.publicId === route.params.id,
    ) ||
    displayedCounselors.value[0] ||
    counselors[0],
)
const privacyChoice = ref(state.accessMode)
const counselorSearch = ref("")
const languageFilter = ref("All languages")
type CounselorCard = (typeof counselors)[number] & { publicId?: string }
const liveCounselors = ref<CounselorCard[]>([])
const displayedCounselors = computed<CounselorCard[]>(() =>
  account.user && !state.demo ? liveCounselors.value : counselors,
)
const languageOptions = computed(() => [
  ...new Set(displayedCounselors.value.flatMap((counselor) => counselor.language.split(", "))),
])
const filteredCounselors = computed(() =>
  displayedCounselors.value.filter(
    (counselor) =>
      (!counselorSearch.value ||
        `${counselor.name} ${counselor.title} ${counselor.areas.join(" ")}`
          .toLowerCase()
          .includes(counselorSearch.value.toLowerCase())) &&
      (languageFilter.value === "All languages" ||
        counselor.language.includes(languageFilter.value)),
  ),
)

const topic = ref("")
const description = ref("")
const consent = ref(false)
const requestError = ref("")
const requestLoading = ref(false)

const authMode = ref<"sign-in" | "create" | "recover">("sign-in")
const accountType = ref<"registered" | "anonymous" | "counselor">("registered")
const accountName = ref("")
const email = ref("")
const password = ref("")
const registrationConsent = ref(false)
const publicId = ref("")
const recoveryPublicId = ref("")
const recoveryInput = ref("")
const newPassword = ref("")
const recoveryCode = ref("")
const showPassword = ref(false)
const authStatus = ref("")
const authLoading = ref(false)
const authReturnToFlow = ref(false)
const postAuthPath = ref("")
const recoveryCopied = ref(false)
const profileStatus = ref("")
const profileLoading = ref(false)
const displayNameDraft = ref("")
const currentPassword = ref("")
const newAccountPassword = ref("")
const confirmAccountPassword = ref("")
const passwordStatus = ref("")
const passwordLoading = ref(false)
const homepageImageUrl = ref<string | null>(null)
const homepageImageUpdatedAt = ref<string | null>(null)
const homepageImageAlt = ref("")
const homepageImageAltDraft = ref("")
const homepageImageFile = ref<File | null>(null)
const homepageImagePreview = ref<string | null>(null)
const homepageImageInput = ref<HTMLInputElement | null>(null)
const homepageSettingsStatus = ref("")
const homepageSettingsError = ref("")
const homepageSettingsLoading = ref(false)
const homepageSettingsSaving = ref(false)
const upgradeName = ref("")
const upgradeEmail = ref("")
const upgradePassword = ref("")
const upgradeConsent = ref(false)
const counselorHeadline = ref("")
const counselorBio = ref("")
const counselorAreas = ref("")
const counselorLanguages = ref("")
const counselorProfessionalTitle = ref("")
const counselorHighestQualification = ref("")
const counselorInstitution = ref("")
const counselorQualificationType = ref("")
const counselorCompletionYear = ref("")
const counselorCertifications = ref("")
const counselorYearsExperience = ref("")
const counselorLicenseNumber = ref("")
const counselorLicensingAuthority = ref("")
const counselorLicenseExpiry = ref("")
const counselorWorkHistory = ref("")
const counselorReferences = ref("")
const counselorProfileDocuments = ref<CounselorProfileDocument[]>([])
const counselorDocumentStatus = ref("")
const counselorProfileApplicationRef = ref("")
const chatError = ref("")
const counselorCases = ref<Array<Record<string, string | null>>>([])
const realConversations = ref<Array<Record<string, string | null>>>([])
const realJourney = ref<Record<string, string>>({})
const currentConversation = ref<{
  publicId: string
  otherPartyPublicId: string
  otherPartyName: string | null
  status: string
} | null>(null)
const realAdminUsers = ref<Array<{
  publicId: string
  accountType: string
  role: string
  status: string
  displayName: string | null
  createdAt: string
  approved?: boolean
  areas?: string[]
  safeguardingReview?: boolean
}>>([])
const liveReportSummary = ref<Record<string, { value: number | null; suppressed: boolean }>>({})
const accountBusy = ref(false)
const counselorApplication = ref<ApplicantApplication | null>(null)
const counselorApplicationLoading = ref(false)
const counselorApplicationError = ref("")
const additionalDocumentsError = ref("")
const counselorNotifications = ref<CounselorNotification[]>([])
const applicantResponse = ref("")
const applicantResponseError = ref("")
const adminApplications = ref<CounselorApplicationSummary[]>([])
const adminNotifications = ref<CounselorNotification[]>([])
const adminApplicationStatus = ref("All statuses")
const adminApplication = ref<CounselorApplicationDetail | null>(null)
const adminApplicationLoading = ref(false)
const adminApplicationError = ref("")
const adminReviewReason = ref("")
const adminDocumentCategories = ref<string[]>([])
const adminCredentialReason = ref("")

const chatText = ref("")
const reportOpen = ref(false)
const reportText = ref("")
const reportStatus = ref("")
const reportLoading = ref(false)

const adminTab = ref("Counselors")
const adminSearch = ref("")
const adminStatus = ref("All statuses")
const adminRows = [
  { name: "Sarah K.", areas: "Prayer, spiritual growth", approval: "Approved", availability: "Available", color: "mint" },
  { name: "John D.", areas: "Relationships, marriage", approval: "Approved", availability: "Limited", color: "gold" },
  { name: "Mary T.", areas: "Bible study, discipleship", approval: "Approved", availability: "Available", color: "blue" },
  { name: "Samuel B.", areas: "Youth, school & career", approval: "Pending review", availability: "Unavailable", color: "blue" },
]
const filteredAdminRows = computed(() =>
  adminRows.filter(
    (row) =>
      (!adminSearch.value ||
        `${row.name} ${row.areas}`.toLowerCase().includes(adminSearch.value.toLowerCase())) &&
      (adminStatus.value === "All statuses" || row.approval === adminStatus.value),
  ),
)

const dashboardTitle = computed(() =>
  account.user?.displayName
    ? `Welcome, ${account.user.displayName}`
    : account.user?.accountType === "anonymous"
      ? "Your private space"
      : "Good morning, Friend",
)
const currentJourneyStage = computed(() => {
  if (!account.user || state.demo) return state.journeyStage
  const stagesForUser = journeyStages.map((stage) => realJourney.value[stage.name])
  const active = stagesForUser.lastIndexOf("in_progress")
  if (active >= 0) return active
  const completed = stagesForUser.lastIndexOf("completed")
  return Math.min(completed + 1, journeyStages.length - 1)
})

const adminSearchResults = computed(() =>
  realAdminUsers.value.filter((row) =>
    `${row.publicId} ${row.displayName || ""} ${row.role} ${row.status}`
      .toLowerCase()
      .includes(adminSearch.value.toLowerCase()),
  ),
)
const adminApplicationStatuses = [
  "PENDING_APPROVAL",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
  "APPROVED",
  "REJECTED",
]
const adminApplicationCounts = computed(() =>
  Object.fromEntries(
    adminApplicationStatuses.map((status) => [
      status,
      adminApplications.value.filter((application) => application.status === status).length,
    ]),
  ),
)
const filteredAdminApplications = computed(() =>
  adminApplications.value.filter(
    (application) =>
      (adminApplicationStatus.value === "All statuses" ||
        application.status === adminApplicationStatus.value) &&
      `${application.publicRef} ${application.publicId} ${application.fullLegalName} ${application.specialization}`
        .toLowerCase()
        .includes(adminSearch.value.toLowerCase()),
  ),
)

const resources = [
  {
    id: "peace",
    type: "Today’s Scripture",
    icon: "BookOpen",
    title: "Philippians 4:6–7",
    body: "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.",
    prompt: "What is God inviting you to trust Him with today?",
  },
  {
    id: "wisdom",
    type: "Reflection",
    icon: "Sparkles",
    title: "A wise next step",
    body: "If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault.",
    prompt: "What is one faithful action you can take this week?",
  },
  {
    id: "prayer",
    type: "Prayer guide",
    icon: "Heart",
    title: "A simple prayer for peace",
    body: "Father, meet me in this moment. Give me wisdom for what I can change and peace with what I cannot.",
    prompt: "Read slowly, then add your own words.",
  },
]
const adminTabs = ["Counselor Applications", "Counselors", "Users", "Resources", "Safeguarding", "Settings"]
const adminTabDescriptions: Record<string, string> = {
  "Counselor Applications": "Review essential profile information and approve access; verify optional credentials separately when provided.",
  Users: "Manage account status without routine access to counseling content.",
  Resources: "Approve Scripture references and discipleship resources before sharing.",
  Safeguarding: "Restricted case triage requires a separate safeguarding permission.",
  Settings: "Manage public homepage artwork and permitted site configuration.",
}
const reportBars = [
  { label: "Week 1", total: 42, accepted: 30 },
  { label: "Week 2", total: 58, accepted: 44 },
  { label: "Week 3", total: 47, accepted: 38 },
  { label: "Week 4", total: 69, accepted: 55 },
]
const reportNeeds = [
  { label: "Prayer & spiritual growth", value: 38 },
  { label: "Relationships / marriage", value: 27 },
  { label: "Personal growth", value: 18 },
  { label: "Bible questions", value: 12 },
]

function go(path: string) {
  void router.push(path)
}

function counselorProfileDocumentUrl(document: CounselorProfileDocument) {
  return apiUrl(
    `/counselor/applications/${encodeURIComponent(counselorProfileApplicationRef.value)}/documents/${encodeURIComponent(document.id)}`,
  )
}

function homeFor(user: AccountUser | null = account.user) {
  if (user?.role === "superadmin") return "/admin"
  if (user?.role === "counselor") return "/counselor"
  if (user?.accountType === "counselor") return "/counselor-application"
  return "/app"
}

async function loadCounselors() {
  const result = await api<{ counselors: Array<{
    publicId: string
    displayName: string | null
    headline: string
    bio: string
    areas: string[]
    languages: string[]
  }> }>("/counselors")
  liveCounselors.value = result.counselors.map((item, index) => {
    const name = item.displayName || item.publicId
    return {
      id: item.publicId,
      publicId: item.publicId,
      name,
      initials: counselorInitials(name),
      title: item.headline,
      bio: item.bio || "This counselor has not added a profile introduction yet.",
      areas: item.areas,
      language: item.languages.length ? item.languages.join(", ") : "Not listed",
      availability: "Availability varies",
      youth: false,
      color: ["mint", "gold", "blue"][index % 3],
    }
  })
}

async function loadAdminUsers(role?: string) {
  const query = new URLSearchParams()
  if (role) query.set("role", role)
  const result = await api<{ users: typeof realAdminUsers.value }>(
    `/admin/users${query.size ? `?${query.toString()}` : ""}`,
  )
  realAdminUsers.value = result.users
}

async function loadAdminApplications() {
  const [result, notifications] = await Promise.all([
    api<{ applications: CounselorApplicationSummary[] }>("/admin/counselor-applications"),
    api<{ notifications: CounselorNotification[] }>("/notifications"),
  ])
  adminApplications.value = result.applications
  adminNotifications.value = notifications.notifications.filter((item) => !item.read_at)
}

async function markAdminNotificationRead(notificationId: string) {
  try {
    await api<void>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: "PATCH",
    })
    adminNotifications.value = adminNotifications.value.filter(
      (notification) => notification.id !== notificationId,
    )
  } catch (error) {
    adminApplicationError.value =
      error instanceof Error ? error.message : "The notification could not be marked as read."
  }
}

async function openAdminApplication(publicRef: string) {
  adminApplicationLoading.value = true
  adminApplicationError.value = ""
  try {
    const result = await api<{ application: CounselorApplicationDetail }>(
      `/admin/counselor-applications/${encodeURIComponent(publicRef)}`,
    )
    adminApplication.value = result.application
    adminReviewReason.value = ""
    adminCredentialReason.value = ""
  } catch (error) {
    adminApplicationError.value =
      error instanceof Error ? error.message : "The counselor application could not be loaded."
  } finally {
    adminApplicationLoading.value = false
  }
}

async function loadCounselorApplication() {
  counselorApplicationLoading.value = true
  counselorApplicationError.value = ""
  try {
    const [result, notifications] = await Promise.all([
      api<{ application: ApplicantApplication }>("/counselor/applications/me"),
      api<{ notifications: CounselorNotification[] }>("/notifications"),
    ])
    counselorApplication.value = result.application
    counselorNotifications.value = notifications.notifications
  } catch (error) {
    counselorApplicationError.value =
      error instanceof Error ? error.message : "Your application status could not be loaded."
  } finally {
    counselorApplicationLoading.value = false
  }
}

function applicationDocumentUrl(document: CounselorApplicationDocument) {
  return apiUrl(
    `/counselor/applications/${encodeURIComponent(counselorApplication.value?.publicRef || "")}/documents/${encodeURIComponent(document.id)}`,
  )
}

function adminApplicationDocumentUrl(document: CounselorApplicationDocument) {
  return apiUrl(
    `/counselor/applications/${encodeURIComponent(adminApplication.value?.publicRef || "")}/documents/${encodeURIComponent(document.id)}`,
  )
}

async function submitApplicantResponse() {
  if (!counselorApplication.value) return
  applicantResponseError.value = ""
  try {
    await api(
      `/counselor/applications/${encodeURIComponent(counselorApplication.value.publicRef)}/responses`,
      {
        method: "POST",
        body: JSON.stringify({ message: applicantResponse.value }),
      },
    )
    applicantResponse.value = ""
    await loadCounselorApplication()
  } catch (error) {
    applicantResponseError.value =
      error instanceof Error ? error.message : "Your response could not be submitted."
  }
}

async function submitAdditionalDocuments(event: Event) {
  const form = event.currentTarget
  if (!(form instanceof HTMLFormElement) || !counselorApplication.value) return
  additionalDocumentsError.value = ""
  const payload = new FormData()
  for (const fieldName of [
    "qualificationDocuments",
    "licenseDocuments",
    "supportingDocuments",
  ]) {
    const input = form.elements.namedItem(fieldName)
    if (!(input instanceof HTMLInputElement) || !input.files) continue
    for (const file of input.files) payload.append(fieldName, file)
  }
  try {
    await api(
      `/counselor/applications/${encodeURIComponent(counselorApplication.value.publicRef)}/documents`,
      { method: "POST", body: payload },
    )
    form.reset()
    await loadCounselorApplication()
  } catch (error) {
    additionalDocumentsError.value =
      error instanceof Error ? error.message : "Your documents could not be uploaded."
  }
}

async function submitAdminApplicationReview(
  action: "UNDER_REVIEW" | "MORE_INFORMATION_REQUIRED" | "APPROVED" | "REJECTED",
) {
  if (!adminApplication.value) return
  adminApplicationError.value = ""
  try {
    await api(
      `/admin/counselor-applications/${encodeURIComponent(adminApplication.value.publicRef)}/review`,
      {
        method: "PATCH",
        body: JSON.stringify({
          action,
          reason: adminReviewReason.value,
          requestedDocumentCategories:
            action === "MORE_INFORMATION_REQUIRED" ? adminDocumentCategories.value : [],
        }),
      },
    )
    await Promise.all([
      loadAdminApplications(),
      openAdminApplication(adminApplication.value.publicRef),
    ])
  } catch (error) {
    adminApplicationError.value =
      error instanceof Error ? error.message : "The application decision could not be recorded."
  }
}

async function verifyApplicationCredential(
  kind: "qualification" | "license",
  verified: boolean,
  qualificationId?: string,
) {
  if (!adminApplication.value || !adminCredentialReason.value.trim()) return
  const routeSuffix =
    kind === "qualification"
      ? `/qualifications/${encodeURIComponent(qualificationId || "")}/verification`
      : "/license-verification"
  try {
    await api(
      `/admin/counselor-applications/${encodeURIComponent(adminApplication.value.publicRef)}${routeSuffix}`,
      {
        method: "PATCH",
        body: JSON.stringify({ verified, reason: adminCredentialReason.value }),
      },
    )
    await openAdminApplication(adminApplication.value.publicRef)
  } catch (error) {
    adminApplicationError.value =
      error instanceof Error ? error.message : "Credential verification could not be recorded."
  }
}

async function toggleApplicantSuspension() {
  if (!adminApplication.value) return
  const status = adminApplication.value.accountStatus === "active" ? "suspended" : "active"
  try {
    await api(
      `/admin/users/${encodeURIComponent(adminApplication.value.publicId)}/status`,
      { method: "PATCH", body: JSON.stringify({ status }) },
    )
    await Promise.all([
      loadAdminApplications(),
      openAdminApplication(adminApplication.value.publicRef),
    ])
  } catch (error) {
    adminApplicationError.value =
      error instanceof Error ? error.message : "The counselor account status could not be changed."
  }
}

async function loadReportSummary() {
  const result = await api<{
    summary: Record<string, { value: number | null; suppressed: boolean }>
  }>("/admin/summary")
  liveReportSummary.value = result.summary
}

function reportValue(key: string) {
  const item = liveReportSummary.value[key]
  if (!item) return "Loading"
  return item.suppressed ? "Suppressed (<5)" : String(item.value)
}

async function loadAccountData() {
  const user = account.user
  if (!user) return

  if (user.accountType === "counselor" && user.role === "registered") {
    state.request = null
    currentConversation.value = null
    realConversations.value = []
    await loadCounselorApplication()
    return
  }

  if (user.role === "anonymous" || user.role === "registered") {
    const [requestResult, conversationResult, journeyResult] = await Promise.all([
      api<{ requests: Array<Record<string, string>> }>("/requests"),
      api<{ conversations: Array<Record<string, string | null>> }>("/conversations"),
      api<{ progress: Array<{ stage: string; status: string }> }>("/journey"),
    ])
    const latest = requestResult.requests[0]
    state.request = latest
      ? {
          reference: latest.public_ref,
          counselor: latest.counselor_name || latest.counselor_public_id,
          topic: latest.topic,
          need: latest.need,
          description: latest.description,
          status: latest.status as RequestStatus,
          createdAt: latest.created_at,
        }
      : null
    realConversations.value = conversationResult.conversations
    const conversation = conversationResult.conversations[0]
    currentConversation.value = conversation
      ? {
          publicId: String(conversation.public_id),
          otherPartyPublicId: String(conversation.other_party_public_id),
          otherPartyName: conversation.other_party_display_name
            ? String(conversation.other_party_display_name)
            : null,
          status: String(conversation.status),
        }
      : null
    realJourney.value = Object.fromEntries(
      journeyResult.progress.map((item) => [item.stage, item.status]),
    )
    const activeStage = journeyStages
      .map((stage) => realJourney.value[stage.name])
      .lastIndexOf("in_progress")
    if (activeStage >= 0) setJourneyStage(activeStage)
  } else if (user.role === "counselor") {
    const [caseResult, conversationResult, profileResult] = await Promise.all([
      api<{ cases: Array<Record<string, string | null>> }>("/counselor/cases"),
      api<{ conversations: Array<Record<string, string | null>> }>("/conversations"),
      api<{ profile: {
        public_ref: string
        headline: string
        bio: string
        areas: string[]
        languages: string[]
        professional_title: string | null
        highest_qualification: string | null
        institution: string | null
        qualification_type: string | null
        completion_year: number | null
        certifications: string | null
        years_experience: number | null
        license_number: string | null
        licensing_authority: string | null
        license_expiry: string | null
        work_history: string | null
        references_text: string | null
        documents: CounselorProfileDocument[]
      } }>("/counselor/profile"),
    ])
    counselorCases.value = caseResult.cases
    realConversations.value = conversationResult.conversations
    counselorHeadline.value = profileResult.profile.headline
    counselorProfileApplicationRef.value = profileResult.profile.public_ref
    counselorBio.value = profileResult.profile.bio
    counselorAreas.value = profileResult.profile.areas.join(", ")
    counselorLanguages.value = profileResult.profile.languages.join(", ")
    counselorProfessionalTitle.value = profileResult.profile.professional_title || ""
    counselorHighestQualification.value = profileResult.profile.highest_qualification || ""
    counselorInstitution.value = profileResult.profile.institution || ""
    counselorQualificationType.value = profileResult.profile.qualification_type || ""
    counselorCompletionYear.value = profileResult.profile.completion_year?.toString() || ""
    counselorCertifications.value = profileResult.profile.certifications || ""
    counselorYearsExperience.value = profileResult.profile.years_experience?.toString() || ""
    counselorLicenseNumber.value = profileResult.profile.license_number || ""
    counselorLicensingAuthority.value = profileResult.profile.licensing_authority || ""
    counselorLicenseExpiry.value = profileResult.profile.license_expiry || ""
    counselorWorkHistory.value = profileResult.profile.work_history || ""
    counselorReferences.value = profileResult.profile.references_text || ""
    counselorProfileDocuments.value = profileResult.profile.documents
    const conversation = conversationResult.conversations[0]
    currentConversation.value = conversation
      ? {
          publicId: String(conversation.public_id),
          otherPartyPublicId: String(conversation.other_party_public_id),
          otherPartyName: conversation.other_party_display_name
            ? String(conversation.other_party_display_name)
            : null,
          status: String(conversation.status),
        }
      : null
    const latest = caseResult.cases[0]
    state.request = latest
      ? {
          reference: String(latest.public_ref),
          counselor: String(latest.seeker_public_id),
          topic: String(latest.topic),
          need: String(latest.need),
          description: String(latest.description || ""),
          status: String(latest.status) as RequestStatus,
          createdAt: String(latest.created_at),
        }
      : null
  } else {
    state.request = null
    currentConversation.value = null
  }

  if (route.name === "counseling" && currentConversation.value?.status === "open") {
    await loadMessages(currentConversation.value.publicId)
  }
  if (user.role === "superadmin" && route.name === "admin") {
    await loadAdminUsers(adminTab.value === "Counselors" ? "counselor" : undefined)
  }
  if (user.role === "superadmin" && route.name === "reports") {
    await loadReportSummary()
  }
}

async function changeRequestStatus(status: RequestStatus, publicRef?: string) {
  if (account.user && !state.demo) {
    const targetRef = publicRef || state.request?.reference
    if (!targetRef) return
    try {
      const result = await api<{ request: { status: RequestStatus }; conversation?: string }>(
        `/requests/${encodeURIComponent(targetRef)}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      )
      if (state.request?.reference === targetRef) state.request.status = result.request.status
      const targetCase = counselorCases.value.find((item) => item.public_ref === targetRef)
      if (targetCase) targetCase.status = result.request.status
      if (result.conversation) await loadAccountData()
      if (status === "Accepted") go("/counseling")
    } catch (error) {
      requestError.value =
        error instanceof Error ? error.message : "Request status could not be updated."
    }
    return
  }
  updateRequest(status)
}

async function updateAdminStatus(user: (typeof realAdminUsers.value)[number], status: string) {
  try {
    await api(`/admin/users/${encodeURIComponent(user.publicId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    })
    user.status = status
  } catch (error) {
    account.error = error instanceof Error ? error.message : "Account status could not be updated."
  }
}

async function updateAdminRole(user: (typeof realAdminUsers.value)[number], role: string) {
  try {
    await api(`/admin/users/${encodeURIComponent(user.publicId)}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    })
    user.role = role
    if (adminTab.value === "Counselors" && role !== "counselor") {
      realAdminUsers.value = realAdminUsers.value.filter((item) => item.publicId !== user.publicId)
    }
  } catch (error) {
    account.error = error instanceof Error ? error.message : "Account role could not be updated."
  }
}

function selectAdminStatus(user: (typeof realAdminUsers.value)[number], event: Event) {
  void updateAdminStatus(user, (event.target as HTMLSelectElement).value)
}

function selectAdminRole(user: (typeof realAdminUsers.value)[number], event: Event) {
  void updateAdminRole(user, (event.target as HTMLSelectElement).value)
}

async function toggleSafeguardingPermission(user: (typeof realAdminUsers.value)[number]) {
  try {
    const granted = !user.safeguardingReview
    await api(`/admin/users/${encodeURIComponent(user.publicId)}/safeguarding-permission`, {
      method: "POST",
      body: JSON.stringify({ granted }),
    })
    user.safeguardingReview = granted
  } catch (error) {
    account.error = error instanceof Error ? error.message : "Safeguarding access could not be updated."
  }
}

async function changeAdminTab(tab: string) {
  adminTab.value = tab
}

async function loadHomepageSettings() {
  const result = await api<{
    homepageImageUrl: string | null
    homepageImageUpdatedAt: string | null
    homepageImageAlt: string
  }>("/site-settings")
  homepageImageUrl.value = result.homepageImageUrl
  homepageImageUpdatedAt.value = result.homepageImageUpdatedAt
  homepageImageAlt.value = result.homepageImageAlt
  homepageImageAltDraft.value = result.homepageImageAlt
}

async function loadAdminSiteSettings() {
  homepageSettingsLoading.value = true
  homepageSettingsError.value = ""
  try {
    const result = await api<{
      homepageImageUrl: string | null
      homepageImageType: string | null
      homepageImageUpdatedAt: string | null
      homepageImageAlt: string
    }>("/admin/site-settings")
    homepageImageUrl.value = result.homepageImageUrl
    homepageImageUpdatedAt.value = result.homepageImageUpdatedAt
    homepageImageAlt.value = result.homepageImageAlt
    homepageImageAltDraft.value = result.homepageImageAlt
    homepageSettingsStatus.value = ""
    clearHomepageImagePreview()
  } catch (error) {
    homepageSettingsError.value =
      error instanceof Error ? error.message : "Site settings could not be loaded."
  } finally {
    homepageSettingsLoading.value = false
  }
}

function clearHomepageImagePreview() {
  if (homepageImagePreview.value) URL.revokeObjectURL(homepageImagePreview.value)
  homepageImagePreview.value = null
  homepageImageFile.value = null
  if (homepageImageInput.value) homepageImageInput.value.value = ""
}

function selectHomepageImage(event: Event) {
  homepageSettingsStatus.value = ""
  homepageSettingsError.value = ""
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    clearHomepageImagePreview()
    homepageSettingsError.value = "Choose a JPEG, PNG, or WebP image."
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    clearHomepageImagePreview()
    homepageSettingsError.value = "Choose an image that is 5 MB or smaller."
    return
  }
  clearHomepageImagePreview()
  homepageImageFile.value = file
  homepageImagePreview.value = URL.createObjectURL(file)
}

async function saveHomepageImage() {
  if (!homepageImageFile.value) return
  homepageSettingsSaving.value = true
  homepageSettingsError.value = ""
  homepageSettingsStatus.value = ""
  try {
    const form = new FormData()
    form.append("homepageImage", homepageImageFile.value)
    form.append("homepageImageAlt", homepageImageAltDraft.value.trim())
    const result = await api<{
      homepageImageUrl: string
      homepageImageUpdatedAt: string
      homepageImageAlt: string
    }>("/admin/site-settings/homepage-image", { method: "POST", body: form })
    homepageImageUrl.value = result.homepageImageUrl
    homepageImageUpdatedAt.value = result.homepageImageUpdatedAt
    homepageImageAlt.value = result.homepageImageAlt
    homepageImageAltDraft.value = result.homepageImageAlt
    homepageSettingsStatus.value = "Homepage image updated."
    clearHomepageImagePreview()
  } catch (error) {
    homepageSettingsError.value =
      error instanceof Error ? error.message : "Homepage image could not be saved."
  } finally {
    homepageSettingsSaving.value = false
  }
}

async function removeHomepageImage() {
  homepageSettingsSaving.value = true
  homepageSettingsError.value = ""
  homepageSettingsStatus.value = ""
  try {
    await api<void>("/admin/site-settings/homepage-image", { method: "DELETE" })
    homepageImageUrl.value = null
    homepageImageUpdatedAt.value = null
    homepageImageAlt.value = ""
    homepageImageAltDraft.value = ""
    clearHomepageImagePreview()
    homepageSettingsStatus.value = "Homepage image removed. The default artwork is showing."
  } catch (error) {
    homepageSettingsError.value =
      error instanceof Error ? error.message : "Homepage image could not be removed."
  } finally {
    homepageSettingsSaving.value = false
  }
}

async function saveDisplayName() {
  profileLoading.value = true
  profileStatus.value = ""
  try {
    const displayName = displayNameDraft.value.trim() || null
    const result = await api<{ user: AccountUser }>("/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    })
    setAccountUser(result.user)
    profileStatus.value = "Account profile updated."
  } catch (error) {
    profileStatus.value =
      error instanceof Error ? error.message : "Account profile could not be saved."
  } finally {
    profileLoading.value = false
  }
}

async function changeAccountPassword() {
  passwordLoading.value = true
  passwordStatus.value = ""
  if (newAccountPassword.value !== confirmAccountPassword.value) {
    passwordStatus.value = "The new passwords do not match."
    passwordLoading.value = false
    return
  }
  try {
    await api("/me/password", {
      method: "PATCH",
      body: JSON.stringify({
        currentPassword: currentPassword.value,
        newPassword: newAccountPassword.value,
      }),
    })
    currentPassword.value = ""
    newAccountPassword.value = ""
    confirmAccountPassword.value = ""
    passwordStatus.value = "Password updated. Other signed-in sessions were revoked."
  } catch (error) {
    passwordStatus.value =
      error instanceof Error ? error.message : "Password could not be updated."
  } finally {
    passwordLoading.value = false
  }
}

async function saveCounselorProfile() {
  profileLoading.value = true
  profileStatus.value = ""
  try {
    const displayName = displayNameDraft.value.trim()
    await api("/counselor/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: displayName || account.user?.publicId,
        headline: counselorHeadline.value,
        bio: counselorBio.value,
        areas: counselorAreas.value.split(",").map((value) => value.trim()).filter(Boolean),
        languages: counselorLanguages.value.split(",").map((value) => value.trim()).filter(Boolean),
        professionalTitle: counselorProfessionalTitle.value || null,
        highestQualification: counselorHighestQualification.value || null,
        institution: counselorInstitution.value || null,
        qualificationType: counselorQualificationType.value || null,
        completionYear: counselorCompletionYear.value ? Number(counselorCompletionYear.value) : null,
        certifications: counselorCertifications.value || null,
        yearsExperience: counselorYearsExperience.value ? Number(counselorYearsExperience.value) : null,
        licenseNumber: counselorLicenseNumber.value || null,
        licensingAuthority: counselorLicensingAuthority.value || null,
        licenseExpiry: counselorLicenseExpiry.value || null,
        workHistory: counselorWorkHistory.value || null,
        referencesText: counselorReferences.value || null,
      }),
    })
    if (account.user) {
      setAccountUser({ ...account.user, displayName: displayName || account.user.publicId })
    }
    profileStatus.value = "Counselor profile updated."
    await loadCounselors()
  } catch (error) {
    profileStatus.value = error instanceof Error ? error.message : "Counselor profile could not be saved."
  } finally {
    profileLoading.value = false
  }
}

async function uploadCounselorProfileDocuments(event: Event) {
  const form = event.currentTarget
  if (!(form instanceof HTMLFormElement)) return
  const payload = new FormData()
  for (const inputName of [
    "qualificationDocuments",
    "licenseDocuments",
    "supportingDocuments",
    "profilePhoto",
  ]) {
    const input = form.elements.namedItem(inputName)
    if (!(input instanceof HTMLInputElement) || !input.files) continue
    for (const file of input.files) payload.append(inputName, file)
  }
  if (![...payload.keys()].length) {
    counselorDocumentStatus.value = "Select at least one file to upload."
    return
  }

  profileLoading.value = true
  counselorDocumentStatus.value = ""
  try {
    const result = await api<{ documents: CounselorProfileDocument[] }>(
      "/counselor/profile/documents",
      { method: "POST", body: payload },
    )
    counselorProfileDocuments.value = [...counselorProfileDocuments.value, ...result.documents]
    counselorDocumentStatus.value = "Profile documents uploaded."
    form.reset()
  } catch (error) {
    counselorDocumentStatus.value =
      error instanceof Error ? error.message : "Profile documents could not be uploaded."
  } finally {
    profileLoading.value = false
  }
}

async function deactivateAccount() {
  if (!window.confirm("Deactivate this account and sign out of all sessions?")) return
  profileLoading.value = true
  profileStatus.value = ""
  try {
    await api<void>("/me/deactivate", { method: "POST" })
    setAccountUser(null)
    await router.replace("/")
  } catch (error) {
    profileStatus.value = error instanceof Error ? error.message : "Account could not be deactivated."
  } finally {
    profileLoading.value = false
  }
}

function journeyStageCompleted(index: number) {
  if (account.user && !state.demo) {
    return realJourney.value[journeyStages[index].name] === "completed"
  }
  return index < state.journeyStage
}

async function updateJourneyStage(index: number) {
  if (account.user && !state.demo) {
    const stage = journeyStages[index].name
    try {
      await api(`/journey/${encodeURIComponent(stage)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "in_progress" }),
      })
      realJourney.value[stage] = "in_progress"
      setJourneyStage(index)
    } catch (error) {
      profileStatus.value = error instanceof Error ? error.message : "Journey progress could not be saved."
    }
    return
  }
  setJourneyStage(index)
}

async function loadMessages(conversationPublicId: string) {
  const result = await api<{ messages: Array<{
    body: string
    created_at: string
    sender_role: string
  }> }>(`/conversations/${encodeURIComponent(conversationPublicId)}/messages`)
  state.messages.splice(
    0,
    state.messages.length,
    ...result.messages.map((message, index) => ({
      id: index + 1,
      from: message.sender_role === "counselor" ? "counselor" as const : "seeker" as const,
      text: message.body,
      time: new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    })),
  )
}

onMounted(async () => {
  void loadHomepageSettings().catch((error) => {
    homepageSettingsError.value =
      error instanceof Error ? error.message : "Homepage settings could not be loaded."
  })
  try {
    await refreshAccount()
    if (account.user) {
      state.demo = false
      localStorage.removeItem("sc-demo")
      resetDemo()
      if (account.user.role === "counselor") state.role = "counselor"
      else if (account.user.role === "superadmin") state.role = "admin"
      await Promise.all([
        account.user.accountType === "counselor" && account.user.role === "registered"
          ? Promise.resolve()
          : loadCounselors(),
        loadAccountData(),
      ])
    }
  } catch {
    // The visible account error is retained in account.error for the signed-in shell.
  }
})

watch(
  () => route.name,
  async (name) => {
    if (!account.user) return
    if (name === "counselors" || name === "counselor-profile" || name === "request") {
      try {
        await loadCounselors()
      } catch (error) {
        requestError.value = error instanceof Error ? error.message : "Counselors could not be loaded."
      }
    }
    if (name === "admin" && account.user.role === "superadmin") {
      try {
        if (adminTab.value === "Counselor Applications") await loadAdminApplications()
        else if (adminTab.value === "Settings") await loadAdminSiteSettings()
        else if (["Counselors", "Users", "Safeguarding"].includes(adminTab.value)) {
          await loadAdminUsers(adminTab.value === "Counselors" ? "counselor" : undefined)
        }
      } catch (error) {
        account.error = error instanceof Error ? error.message : "Accounts could not be loaded."
      }
    }
    if (name === "counselor-application" && account.user.accountType === "counselor") {
      await loadCounselorApplication()
    }
    if (name === "reports" && account.user.role === "superadmin") {
      try {
        await loadReportSummary()
      } catch (error) {
        account.error = error instanceof Error ? error.message : "Reports could not be loaded."
      }
    }
    if (name === "counseling") {
      try {
        await loadAccountData()
      } catch (error) {
        chatError.value = error instanceof Error ? error.message : "Conversation could not be loaded."
      }
    }
  },
)

onBeforeUnmount(() => {
  if (homepageImagePreview.value) URL.revokeObjectURL(homepageImagePreview.value)
})

watch(adminTab, (tab) => {
  if (route.name === "admin" && account.user?.role === "superadmin" && !state.demo) {
    const loading = tab === "Counselor Applications"
      ? loadAdminApplications()
      : tab === "Settings"
        ? loadAdminSiteSettings()
        : ["Counselors", "Users", "Safeguarding"].includes(tab)
          ? loadAdminUsers(tab === "Counselors" ? "counselor" : undefined)
          : Promise.resolve()
    void loading.catch((error) => {
      account.error = error instanceof Error ? error.message : "Accounts could not be loaded."
    })
  }
})

watch(
  () => account.user?.displayName,
  (displayName) => {
    displayNameDraft.value = displayName || ""
  },
  { immediate: true },
)

watch(accountType, () => {
  accountName.value = ""
  email.value = ""
  password.value = ""
  publicId.value = ""
  registrationConsent.value = false
  authStatus.value = ""
})

function continuePrivacy() {
  setAccessMode(privacyChoice.value)
  accountType.value = privacyChoice.value === "private" ? "anonymous" : "registered"
  authMode.value = "create"
  authReturnToFlow.value = true
  go("/sign-in")
}

async function submitRequest() {
  if (topic.value.trim().length < 3 || !consent.value) {
    requestError.value =
      "Add a short topic and confirm that you understand the privacy notice."
    return
  }

  requestLoading.value = true
  requestError.value = ""
  try {
    if (account.user && !state.demo) {
      const counselorPublicId = selectedCounselor.value.publicId
      if (!counselorPublicId) {
        throw new Error("Choose an approved counselor with an active ShepherdConnect account.")
      }
      const result = await api<{ request: {
        public_ref: string
        status: RequestStatus
        created_at: string
      } }>("/requests", {
        method: "POST",
        body: JSON.stringify({
          counselorPublicId,
          need: state.need,
          topic: topic.value.trim(),
          description: description.value.trim(),
        }),
      })
      state.request = {
        reference: result.request.public_ref,
        counselor: selectedCounselor.value.name,
        topic: topic.value.trim(),
        need: state.need,
        description: description.value.trim(),
        status: result.request.status,
        createdAt: result.request.created_at,
      }
    } else if (state.demo) {
      setDemo(true)
      createRequest({
        counselor: selectedCounselor.value.name,
        topic: topic.value.trim(),
        need: state.need,
        description: description.value.trim(),
      })
    } else {
      accountType.value = state.accessMode === "private" ? "anonymous" : "registered"
      authMode.value = "create"
      authReturnToFlow.value = true
      requestError.value = "Create your private account to securely send and track this request."
      go("/sign-in")
      return
    }
    go("/app")
  } catch (error) {
    requestError.value =
      error instanceof Error ? error.message : "Your request could not be sent."
  } finally {
    requestLoading.value = false
  }
}

async function submitAuth() {
  authLoading.value = true
  authStatus.value = ""
  recoveryCode.value = ""
  try {
    let result: AuthResponse
    if (authMode.value === "recover") {
      result = await api<AuthResponse>("/auth/recover", {
        method: "POST",
        body: JSON.stringify({
          publicId: recoveryPublicId.value,
          recoveryCode: recoveryInput.value,
          newPassword: newPassword.value,
        }),
      })
      postAuthPath.value = homeFor(result.user)
      authStatus.value = result.recoveryCodeWarning || "Account recovered. Save your replacement recovery code."
    } else if (authMode.value === "create" && accountType.value === "anonymous") {
      result = await api<AuthResponse>("/auth/anonymous", {
        method: "POST",
        body: JSON.stringify({ password: password.value }),
      })
      postAuthPath.value = authReturnToFlow.value ? "/needs" : homeFor(result.user)
      authStatus.value = result.recoveryCodeWarning || "Private account created. Save your recovery code."
    } else if (authMode.value === "create") {
      result = await api<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: email.value,
          password: password.value,
          displayName: accountName.value,
          consent: registrationConsent.value,
        }),
      })
      postAuthPath.value = authReturnToFlow.value ? "/needs" : homeFor(result.user)
      authStatus.value = result.recoveryCodeWarning || "Account created. Save your recovery code."
    } else {
      result = await api<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          login: accountType.value === "anonymous" ? publicId.value : email.value,
          password: password.value,
        }),
      })
      setAccountUser(result.user)
      setDemo(false)
      localStorage.removeItem("sc-demo")
      resetDemo()
      if (result.user.role === "counselor") state.role = "counselor"
      if (result.user.role === "superadmin") state.role = "admin"
      await Promise.all([loadCounselors(), loadAccountData()])
      go(homeFor(result.user))
    }
    if (authMode.value !== "sign-in") {
      setAccountUser(result.user)
      setDemo(false)
      localStorage.removeItem("sc-demo")
      resetDemo()
      recoveryCode.value = result.recoveryCode || ""
      recoveryCopied.value = false
      await refreshAccount()
    }
  } catch (error) {
    authStatus.value =
      error instanceof Error ? error.message : "The account request could not be completed."
  } finally {
    authLoading.value = false
  }
}

async function submitCounselorApplication(payload: FormData, existingAccount = false) {
  authLoading.value = true
  authStatus.value = ""
  recoveryCode.value = ""
  try {
    const result = await api<AuthResponse>(
      existingAccount ? "/counselor/applications" : "/auth/counselor",
      {
        method: "POST",
        body: existingAccount ? String(payload.get("application") || "{}") : payload,
      },
    )
    setAccountUser(result.user)
    setDemo(false)
    localStorage.removeItem("sc-demo")
    resetDemo()
    await refreshAccount()
    if (existingAccount) {
      go("/counselor-application")
    } else {
      postAuthPath.value = "/counselor-application"
      authStatus.value =
        result.recoveryCodeWarning ||
        "Application submitted. Counselor access remains unavailable until approval."
      recoveryCode.value = result.recoveryCode || ""
      recoveryCopied.value = false
      await loadCounselorApplication()
    }
  } catch (error) {
    authStatus.value =
      error instanceof Error ? error.message : "The counselor application could not be submitted."
  } finally {
    authLoading.value = false
  }
}

function continueAfterRecoveryCode() {
  recoveryCode.value = ""
  go(postAuthPath.value || homeFor())
}

async function copyRecoveryCode() {
  try {
    await navigator.clipboard.writeText(recoveryCode.value)
    recoveryCopied.value = true
  } catch {
    const message = "Copy was unavailable. Select and copy the recovery code manually."
    if (route.name === "account-settings") profileStatus.value = message
    else authStatus.value = message
  }
}

async function rotateRecoveryCode() {
  profileLoading.value = true
  profileStatus.value = ""
  try {
    const result = await api<{ recoveryCode: string; recoveryCodeWarning: string }>(
      "/auth/recovery-code/rotate",
      { method: "POST" },
    )
    recoveryCode.value = result.recoveryCode
    profileStatus.value = result.recoveryCodeWarning
  } catch (error) {
    profileStatus.value =
      error instanceof Error ? error.message : "Recovery code could not be rotated."
  } finally {
    profileLoading.value = false
  }
}

async function upgradeAccount() {
  profileLoading.value = true
  profileStatus.value = ""
  try {
    const result = await api<AuthResponse>("/me/upgrade", {
      method: "POST",
      body: JSON.stringify({
        email: upgradeEmail.value,
        password: upgradePassword.value,
        displayName: upgradeName.value,
        consent: upgradeConsent.value,
      }),
    })
    setAccountUser(result.user)
    recoveryCode.value = result.recoveryCode || ""
    profileStatus.value = result.recoveryCodeWarning || "Account upgraded."
    upgradePassword.value = ""
    upgradeConsent.value = false
  } catch (error) {
    profileStatus.value =
      error instanceof Error ? error.message : "Account upgrade could not be completed."
  } finally {
    profileLoading.value = false
  }
}

async function submitMessage() {
  const text = chatText.value.trim()
  if (!text) return
  if (account.user && !state.demo) {
    if (!currentConversation.value || currentConversation.value.status !== "open") {
      chatError.value = "There is no open assigned conversation to message."
      return
    }
    try {
      await api(`/conversations/${encodeURIComponent(currentConversation.value.publicId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      })
      sendMessage(text)
      chatText.value = ""
      chatError.value = ""
    } catch (error) {
      chatError.value = error instanceof Error ? error.message : "Message could not be sent."
    }
    return
  }
  sendMessage(text)
  chatText.value = ""
}

async function submitReport() {
  const summary = reportText.value.trim()
  if (summary.length < 5) {
    reportStatus.value = "Please share at least a few words so the concern can be reviewed."
    return
  }

  reportLoading.value = true
  reportStatus.value = ""
  try {
    if (!account.user && !state.demo) {
      reportStatus.value = "Sign in to submit a safeguarding concern."
      return
    }
    if (account.user && !state.demo) {
      await api("/concerns", {
        method: "POST",
        body: JSON.stringify({ summary }),
      })
      reportStatus.value = "Your concern was submitted for safeguarding review."
    } else {
      reportStatus.value = "Demo preview only: this concern was not sent to safeguarding."
    }
    reportText.value = ""
  } catch (error) {
    reportStatus.value =
      error instanceof Error ? error.message : "Could not submit concern."
  } finally {
    reportLoading.value = false
  }
}

function leaveConversation() {
  sessionStorage.clear()
  void router.replace("/safe")
}

function counselorInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
}

</script>

<template>
  <main v-if="route.name === 'home' || route.name === 'about'" class="public-page">
    <header class="public-header">
      <RouterLink to="/"><Brand /></RouterLink>
      <nav>
        <RouterLink to="/about">How it works</RouterLink>
        <RouterLink to="/sign-in">Sign in</RouterLink>
      </nav>
    </header>
    <section class="hero">
      <div class="hero-copy">
        <Badge tone="success"><Icon name="ShieldCheck" :size="14" /> A ministry of GCML</Badge>
        <h1>A safe place to be heard, guided, and grow.</h1>
        <p class="hero-lead">
          Connect privately with a GCML-approved counselor for Biblical guidance,
          caring conversation, and a path toward lasting discipleship.
        </p>
        <div class="hero-actions">
          <BaseButton @click="go('/privacy')">Find support <Icon name="ArrowRight" /></BaseButton>
          <BaseButton variant="secondary" @click="setDemo(true); go('/app')">Explore the demo</BaseButton>
        </div>
        <p class="microcopy"><Icon name="LockKeyhole" :size="15" /> Your privacy choice comes before we ask for personal details.</p>
      </div>
      <div
        class="hero-visual"
        :class="{ 'hero-visual-photo': homepageImageUrl }"
        aria-label="Counsel, guide, disciple"
      >
        <img
          v-if="homepageImageUrl"
          class="hero-photo"
          :src="apiUrl(homepageImageUrl)"
          :alt="homepageImageAlt"
        />
        <div class="hero-glow" />
        <div class="hero-card hero-card-verse">
          <Icon name="BookOpen" :size="20" />
          <div><small>Today’s encouragement</small><strong>Philippians 4:6–7</strong></div>
        </div>
        <div class="path-card">
          <div><span><Icon name="HeartHandshake" /></span><b>Counsel</b></div><i />
          <div><span><Icon name="BookHeart" /></span><b>Guide</b></div><i />
          <div><span><Icon name="Sprout" /></span><b>Disciple</b></div>
        </div>
      </div>
    </section>
    <section class="trust-row" aria-label="Service commitments">
      <div><Icon name="Shield" :size="21" /><span><strong>Private by design</strong><small>Choose how you’re known</small></span></div>
      <div><Icon name="UserRoundCheck" :size="21" /><span><strong>GCML approved</strong><small>Trusted ministry counselors</small></span></div>
      <div><Icon name="BookOpen" :size="21" /><span><strong>Biblically grounded</strong><small>Guidance rooted in Scripture</small></span></div>
    </section>
    <section class="how-section">
      <div class="section-kicker">How ShepherdConnect works</div>
      <h2>Care for today. Growth for what comes next.</h2>
      <div class="steps-grid">
        <article v-for="step in [
          { number: '01', title: 'Share what you need', body: 'Choose a need area and the level of privacy that feels right.' },
          { number: '02', title: 'Connect with care', body: 'Request support from a GCML-approved counselor who fits your needs.' },
          { number: '03', title: 'Keep growing', body: 'Receive Scripture, practical next steps, and an optional discipleship journey.' },
        ]" :key="step.number">
          <span>{{ step.number }}</span><h3>{{ step.title }}</h3><p>{{ step.body }}</p>
        </article>
      </div>
    </section>
    <section class="safety-strip">
      <div><Icon name="ShieldCheck" :size="26" /><span><strong>Your safety matters</strong><p>ShepherdConnect is not an emergency or clinical mental-health service. If you are in immediate danger, contact local emergency support or a trusted person near you.</p></span></div>
      <RouterLink to="/about">Read our safety approach <Icon name="ArrowRight" :size="16" /></RouterLink>
    </section>
    <footer class="public-footer"><Brand compact /><p>Great Commission Movement of Liberia</p><span>Private counsel. Biblical guidance. Personal discipleship.</span></footer>
  </main>

  <main v-else-if="route.name === 'privacy'" class="flow-page">
    <div class="flow-top"><Brand /><span>Step 1 of 3</span></div>
    <div class="flow-shell">
      <button class="back-link" @click="go('/')"><Icon name="ArrowLeft" :size="17" /> Back</button>
      <div class="flow-heading">
        <span class="flow-icon"><Icon name="Shield" :size="24" /></span>
        <h1>How would you like to continue?</h1>
        <p>You’re in control of how much identifying information you share.</p>
      </div>
      <div class="choice-grid">
        <button :class="privacyChoice === 'profile' ? 'choice-card selected' : 'choice-card'" @click="privacyChoice = 'profile'">
          <span class="choice-icon"><Icon name="UserRound" :size="26" /></span><span class="choice-check"><Icon v-if="privacyChoice === 'profile'" name="Check" :size="15" /></span>
          <h2>Continue with a profile</h2><p>Create an account so you can return easily, receive updates, and keep your journey in one place.</p>
          <ul><li><Icon name="Check" :size="15" /> Sign in with email</li><li><Icon name="Check" :size="15" /> Choose your display name</li><li><Icon name="Check" :size="15" /> Access your journey later</li></ul>
        </button>
        <button :class="privacyChoice === 'private' ? 'choice-card selected' : 'choice-card'" @click="privacyChoice = 'private'">
          <span class="choice-icon private"><Icon name="EyeOff" :size="26" /></span><span class="choice-check"><Icon v-if="privacyChoice === 'private'" name="Check" :size="15" /></span>
          <h2>Continue in Private mode</h2><p>Use a generated alias. Your real name is not shown to your counselor unless you choose to share it.</p>
          <ul><li><Icon name="Check" :size="15" /> No real name required</li><li><Icon name="Check" :size="15" /> Counselor sees an alias</li><li><Icon name="Check" :size="15" /> Minimal account information</li></ul>
        </button>
      </div>
      <Notice title="What Private mode means">Private mode reduces identity collection, but it cannot remove all technical records such as security logs or device/network metadata. Safeguarding exceptions may apply under approved GCML policy.</Notice>
      <BaseButton class-name="flow-continue" @click="continuePrivacy">Continue <Icon name="ArrowRight" /></BaseButton>
    </div>
  </main>

  <main v-else-if="route.name === 'needs'" class="flow-page">
    <div class="flow-top"><Brand /><span>Step 2 of 3</span></div>
    <div class="flow-shell flow-shell-wide">
      <button class="back-link" @click="go('/privacy')"><Icon name="ArrowLeft" :size="17" /> Back</button>
      <div class="flow-heading compact"><span class="flow-icon"><Icon name="HeartHandshake" :size="24" /></span><h1>What would you like support with?</h1><p>Choose the area that best fits. You can explain more privately after selecting a counselor.</p></div>
      <div class="need-grid">
        <button v-for="(item, index) in needs" :key="item.title" :class="state.need === item.title ? 'need-card selected' : 'need-card'" @click="setNeed(item.title)">
          <span><Icon :name="['Sparkles','Heart','BookOpen','GraduationCap','Sprout','MoreHorizontal'][index]" :size="22" /></span><div><strong>{{ item.title }}</strong><small>{{ item.note }}</small></div><i><Icon v-if="state.need === item.title" name="Check" :size="14" /></i>
        </button>
      </div>
      <div class="flow-actions"><BaseButton variant="secondary" @click="go('/privacy')">Back</BaseButton><BaseButton @click="go('/counselors')">Find a counselor <Icon name="ArrowRight" /></BaseButton></div>
    </div>
  </main>

  <main v-else-if="route.name === 'counselors'" class="flow-page">
    <div class="flow-top"><Brand /><span>Step 3 of 3</span></div>
    <div class="directory-shell">
      <button class="back-link" @click="go('/needs')"><Icon name="ArrowLeft" :size="17" /> Back</button>
      <div class="directory-heading"><div><h1>Find a counselor</h1><p>Every counselor shown here is approved by GCML.</p></div><Badge tone="success"><Icon name="ShieldCheck" :size="14" /> Verified profiles</Badge></div>
      <div class="filters">
        <label class="search-control"><Icon name="Search" :size="18" /><input v-model="counselorSearch" placeholder="Search counselors or service areas" /></label>
        <select v-model="languageFilter" class="control"><option>All languages</option><option v-for="language in languageOptions" :key="language">{{ language }}</option></select>
      </div>
      <p class="results-label">{{ filteredCounselors.length }} counselors available for <strong>{{ state.need }}</strong></p>
      <div class="counselor-grid">
        <article v-for="counselor in filteredCounselors" :key="counselor.id" class="counselor-card">
          <div class="counselor-card-top"><span :class="`counselor-avatar avatar-${counselor.color}`">{{ counselor.initials }}</span><Badge tone="success"><span class="status-dot" /> {{ counselor.availability }}</Badge></div>
          <h2>{{ counselor.name }}</h2><p class="counselor-title">{{ counselor.title }}</p><p>{{ counselor.bio }}</p>
          <div class="tag-row"><Badge v-for="area in counselor.areas.slice(0,3)" :key="area">{{ area }}</Badge></div>
          <div class="counselor-meta"><span><Icon name="Languages" :size="16" /> {{ counselor.language }}</span><span v-if="counselor.youth"><Icon name="ShieldCheck" :size="16" /> Youth approved</span></div>
          <RouterLink class="card-link" :to="`/counselors/${counselor.id}`">View profile <Icon name="ArrowRight" :size="16" /></RouterLink>
        </article>
      </div>
      <div v-if="!filteredCounselors.length" class="empty-state"><span><Icon name="MessageCircle" :size="26" /></span><h3>{{ account.user && !state.demo && !liveCounselors.length ? 'No approved counselor profiles are available yet' : 'No counselor matches those filters' }}</h3><p>{{ account.user && !state.demo && !liveCounselors.length ? 'Please check back later or contact ShepherdConnect support.' : 'Try another language or a broader search.' }}</p></div>
    </div>
  </main>

  <main v-else-if="route.name === 'counselor-profile'" class="flow-page">
    <div class="flow-top"><Brand /></div>
    <div class="profile-shell">
      <button class="back-link" @click="go('/counselors')"><Icon name="ArrowLeft" :size="17" /> All counselors</button>
      <div class="profile-layout">
        <aside class="profile-summary">
          <span :class="`counselor-avatar avatar-lg avatar-${selectedCounselor.color}`">{{ selectedCounselor.initials }}</span><h1>{{ selectedCounselor.name }}</h1><p>{{ selectedCounselor.title }}</p><Badge tone="success"><Icon name="ShieldCheck" :size="14" /> GCML approved</Badge>
          <div class="profile-facts"><span><Icon name="Clock3" :size="17" /><b>Availability</b><small>{{ selectedCounselor.availability }}</small></span><span><Icon name="Languages" :size="17" /><b>Languages</b><small>{{ selectedCounselor.language }}</small></span><span v-if="selectedCounselor.youth"><Icon name="ShieldCheck" :size="17" /><b>Youth support</b><small>Approved</small></span></div>
          <BaseButton @click="go(`/request/${selectedCounselor.id}`)">Request counseling <Icon name="ArrowRight" /></BaseButton><small class="no-guarantee">Availability and response times are not guaranteed.</small>
        </aside>
        <main class="profile-body">
          <section><span class="section-kicker">About</span><h2>A caring guide for your next step</h2><p>{{ selectedCounselor.bio }} Their approach is prayerful, confidential within stated limits, and centered on helping each person make wise and practical progress.</p></section>
          <section><h3>Areas of service</h3><div class="service-list"><span v-for="area in [...selectedCounselor.areas, 'Discipleship follow-up']" :key="area"><Icon name="CheckCircle2" :size="18" /> {{ area }}</span></div></section>
          <section class="boundary-card"><Icon name="Shield" :size="22" /><div><h3>Healthy counseling boundaries</h3><p>Counselors do not provide emergency or clinical care. Conversations follow GCML safeguarding and privacy policies, and you can report a concern at any time.</p></div></section>
        </main>
      </div>
    </div>
  </main>

  <main v-else-if="route.name === 'request'" class="flow-page">
    <div class="flow-top"><Brand /></div>
    <div class="request-shell">
      <button class="back-link" @click="go(`/counselors/${selectedCounselor.id}`)"><Icon name="ArrowLeft" :size="17" /> Back</button>
      <div class="request-layout">
        <div class="request-copy">
          <Badge tone="blue"><Icon name="LockKeyhole" :size="14" /> Private request</Badge><h1>Start a conversation with {{ selectedCounselor.name }}</h1><p>Share only what feels necessary. Your counselor will see this after the request is assigned to them.</p>
          <div class="mini-counselor"><span :class="`counselor-avatar avatar-${selectedCounselor.color}`">{{ selectedCounselor.initials }}</span><div><strong>{{ selectedCounselor.name }}</strong><small>{{ selectedCounselor.title }}</small></div></div>
          <Notice :title="state.accessMode === 'private' ? 'You’re using Private mode' : 'You’re using profile mode'">{{ state.accessMode === 'private' ? 'Your counselor will see a generated alias, not your real name.' : 'Your chosen display name may be shown to your counselor.' }}</Notice>
        </div>
        <form class="form-card" @submit.prevent="submitRequest">
          <Field label="What would you like to talk about?"><input v-model="topic" class="control" maxlength="120" required placeholder="A short topic, e.g. anxiety about school" /></Field>
          <Field label="Brief description" :hint="`${description.length}/1500 · Do not include urgent or unnecessary identifying details.`"><textarea v-model="description" class="control textarea" maxlength="1500" rows="6" placeholder="Share what would help the counselor understand your situation…" /></Field>
          <Field label="Preferred method"><select class="control"><option>Private chat</option></select></Field>
          <label class="check-label"><input v-model="consent" type="checkbox" /><span>I understand ShepherdConnect is not an emergency or clinical service and that safeguarding limits may apply.</span></label>
          <p v-if="requestError" class="form-error" role="alert">{{ requestError }}</p>
          <BaseButton type="submit" :disabled="requestLoading" class-name="submit-wide">{{ requestLoading ? 'Sending securely…' : 'Send private request' }} <Icon name="Send" :size="17" /></BaseButton>
          <small class="secure-note"><Icon name="ShieldCheck" :size="14" /> Submitted data is protected in transit. Share only what is necessary; this is not an emergency service.</small>
        </form>
      </div>
    </div>
  </main>

  <main v-else-if="route.name === 'sign-in'" class="auth-page">
    <RouterLink to="/" class="auth-brand"><Brand /></RouterLink>
    <div class="auth-layout">
      <section class="auth-message"><Badge tone="success"><Icon name="ShieldCheck" :size="14" /> Secure account access</Badge><h1>Your journey can continue here.</h1><p>Return to conversations, saved guidance, and your discipleship path from one private place.</p><div class="auth-quote"><Icon name="BookOpen" :size="22" /><blockquote>“I am the good shepherd. I know my own and my own know me.”</blockquote><cite>John 10:14</cite></div></section>
      <section v-if="!recoveryCode" class="auth-card">
        <Field v-if="authMode !== 'recover'" label="Account type">
          <select v-model="accountType" class="control">
            <option value="registered">Regular User</option>
            <option value="anonymous">Anonymous User</option>
            <option value="counselor">Counselor</option>
          </select>
        </Field>
        <div v-if="authMode !== 'recover'" class="auth-tabs">
          <button type="button" :class="{ active: authMode === 'sign-in' }" @click="authMode = 'sign-in'">Sign in</button>
          <button type="button" :class="{ active: authMode === 'create' }" @click="authMode = 'create'">Create account</button>
        </div>
        <h2>{{ authMode === 'recover' ? 'Recover your account' : authMode === 'sign-in' ? 'Welcome back' : accountType === 'anonymous' ? 'Create a private account' : accountType === 'counselor' ? 'Apply to become a counselor' : 'Create your profile' }}</h2>
        <p>{{ authMode === 'recover' ? 'Use your public account ID and one-time recovery code to set a new password.' : accountType === 'anonymous' ? 'No real name, email, or phone number is required. Your public ID is not a sign-in credential.' : accountType === 'counselor' ? 'Complete a professional application. Counselor access is only activated after SuperAdmin approval.' : 'Use an email address and display name for your account.' }}</p>
        <CounselorRegistrationForm
          v-if="authMode === 'create' && accountType === 'counselor'"
          :busy="authLoading"
          :error="authStatus"
          @submit="submitCounselorApplication"
        />
        <form v-else class="auth-fields" @submit.prevent="submitAuth">
          <template v-if="authMode === 'recover'">
            <Field label="Public account ID"><input v-model="recoveryPublicId" class="control" required autocomplete="off" placeholder="AN-, SC-, or CA-XXXXXXXX" /></Field>
            <Field label="One-time recovery code"><input v-model="recoveryInput" class="control" required autocomplete="off" /></Field>
            <Field label="New password"><input v-model="newPassword" class="control" type="password" minlength="12" maxlength="128" required autocomplete="new-password" /></Field>
          </template>
          <template v-else>
            <Field v-if="authMode === 'create' && accountType === 'registered'" label="Display name"><input v-model="accountName" class="control" required maxlength="80" autocomplete="name" /></Field>
            <Field v-if="accountType === 'anonymous' && authMode === 'sign-in'" label="Public account ID"><input v-model="publicId" class="control" required autocomplete="username" placeholder="AN-XXXXXXXX" /></Field>
            <Field v-if="accountType !== 'anonymous'" label="Email"><input v-model="email" class="control" type="email" required autocomplete="email" /></Field>
            <Field label="Password"><div class="password-control"><input v-model="password" class="control" :type="showPassword ? 'text' : 'password'" :minlength="authMode === 'create' ? 12 : 1" maxlength="128" required :autocomplete="authMode === 'sign-in' ? 'current-password' : 'new-password'" /><button type="button" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword"><Icon :name="showPassword ? 'EyeOff' : 'Eye'" /></button></div></Field>
            <Notice v-if="accountType === 'anonymous' && authMode === 'create'" title="Save your recovery code">It is displayed only once. If you lose both your password and recovery code, ShepherdConnect cannot identify you to restore access.</Notice>
            <label v-if="authMode === 'create' && accountType === 'registered'" class="check-label"><input v-model="registrationConsent" type="checkbox" required /><span>I agree to the account terms, privacy notice, and consent to the processing needed to provide ShepherdConnect services.</span></label>
          </template>
          <p v-if="authStatus" class="form-error" role="alert">{{ authStatus }}</p>
          <BaseButton type="submit" class-name="submit-wide" :disabled="authLoading">{{ authLoading ? 'Please wait…' : authMode === 'recover' ? 'Recover account' : authMode === 'sign-in' ? 'Sign in securely' : 'Create account' }}</BaseButton>
          <button v-if="authMode === 'sign-in'" type="button" class="auth-text-button" @click="authMode = 'recover'">Use a recovery code</button>
          <button v-else-if="authMode === 'recover'" type="button" class="auth-text-button" @click="authMode = 'sign-in'">Back to sign in</button>
        </form>
        <template v-if="authMode !== 'recover' && !(authMode === 'create' && accountType === 'counselor')">
          <div class="auth-divider"><span>or preview with synthetic data</span></div>
          <BaseButton type="button" variant="secondary" class-name="submit-wide" @click="setDemo(true); go('/app')">Explore demo workspace</BaseButton>
        </template>
      </section>
      <section v-else class="auth-card recovery-display" aria-live="polite">
        <Badge tone="success"><Icon name="ShieldCheck" :size="14" /> Save this code now</Badge>
        <h2>Your one-time recovery code</h2>
        <p>{{ authStatus || "This code cannot be retrieved later. Keep it separate from your password." }}</p>
        <code>{{ recoveryCode }}</code>
        <BaseButton variant="secondary" class-name="submit-wide" @click="copyRecoveryCode">{{ recoveryCopied ? 'Copied' : 'Copy recovery code' }}</BaseButton>
        <BaseButton class-name="submit-wide" @click="continueAfterRecoveryCode">Continue to ShepherdConnect</BaseButton>
        <small>Private mode does not mean absolute technical anonymity. Account activity is stored to support your requests and conversations.</small>
      </section>
    </div>
  </main>

  <AppShell
    v-else-if="route.name === 'counselor-application'"
    title="Counselor application"
    eyebrow="Application status"
  >
    <Notice v-if="counselorApplicationError" title="Application status unavailable" tone="warning">
      {{ counselorApplicationError }}
    </Notice>
    <div v-else-if="counselorApplicationLoading" class="panel application-status-panel">
      <p>Loading your application status…</p>
    </div>
    <template v-else-if="counselorApplication">
      <section class="panel application-status-panel">
        <div class="card-heading">
          <div>
            <span class="section-kicker">Application reference</span>
            <h2>{{ counselorApplication.publicRef }}</h2>
          </div>
          <Badge tone="warning">{{ counselorApplication.status.replace(/_/g, " ") }}</Badge>
        </div>
        <p v-if="counselorApplication.status === 'PENDING_APPROVAL'">
          Your application has been received. A SuperAdmin will review your essential account and profile information before counselor access can be activated. Optional professional credentials can be verified separately.
        </p>
        <p v-else-if="counselorApplication.status === 'UNDER_REVIEW'">
          Your application is being reviewed. You cannot access counselor functions unless the application is approved.
        </p>
        <p v-else-if="counselorApplication.status === 'MORE_INFORMATION_REQUIRED'">
          A reviewer needs additional information. Your counselor privileges remain disabled while you respond.
        </p>
        <p v-else-if="counselorApplication.status === 'APPROVED'">
          Your application was approved. Counselor features are now available from the Requests navigation item.
        </p>
        <p v-else>
          Your application was not approved. The review history and decision details appear below.
        </p>
        <small>Submitted {{ new Date(counselorApplication.submittedAt).toLocaleString() }}</small>
      </section>

      <section v-if="counselorNotifications.length" class="panel application-status-panel">
        <span class="section-kicker">Application updates</span>
        <article v-for="notification in counselorNotifications" :key="notification.id" class="application-notification">
          <strong>{{ notification.title }}</strong>
          <p>{{ notification.message }}</p>
          <small>{{ new Date(notification.created_at).toLocaleString() }}</small>
        </article>
      </section>

      <section v-if="counselorApplication.informationRequests.length" class="panel application-status-panel">
        <span class="section-kicker">Information requested</span>
        <article v-for="(request, index) in counselorApplication.informationRequests" :key="index" class="application-notification">
          <p>{{ request.reason }}</p>
          <small>{{ new Date(request.created_at).toLocaleString() }}</small>
        </article>
      </section>

      <section class="panel application-status-panel">
        <span class="section-kicker">Supporting documents</span>
        <p>Documents are optional at initial application. Uploaded files are private and available only to you and authorized reviewers.</p>
        <div v-if="counselorApplication.documents.length" class="application-document-list">
          <div v-for="document in counselorApplication.documents" :key="document.id">
            <span><strong>{{ document.category.replace(/_/g, " ") }}</strong><small>{{ document.originalName || "Awaiting your upload" }}</small></span>
            <a v-if="document.status === 'uploaded'" class="inline-action" :href="applicationDocumentUrl(document)">Download securely</a>
            <Badge v-else tone="warning">Requested</Badge>
          </div>
        </div>
        <form
          v-if="counselorApplication.status === 'MORE_INFORMATION_REQUIRED' && counselorApplication.documents.some((document) => document.status === 'requested')"
          class="settings-form application-upload-form"
          @submit.prevent="submitAdditionalDocuments"
        >
          <Field v-if="counselorApplication.documents.some((document) => document.status === 'requested' && document.category === 'qualification')" label="Requested qualification documents — optional">
            <input class="control file-control" type="file" name="qualificationDocuments" accept=".pdf,.jpg,.jpeg,.png" multiple />
          </Field>
          <Field v-if="counselorApplication.documents.some((document) => document.status === 'requested' && document.category === 'license')" label="Requested license evidence — optional">
            <input class="control file-control" type="file" name="licenseDocuments" accept=".pdf,.jpg,.jpeg,.png" multiple />
          </Field>
          <Field v-if="counselorApplication.documents.some((document) => document.status === 'requested' && document.category === 'supporting')" label="Requested supporting documents — optional">
            <input class="control file-control" type="file" name="supportingDocuments" accept=".pdf,.jpg,.jpeg,.png" multiple />
          </Field>
          <p v-if="additionalDocumentsError" class="form-error" role="alert">{{ additionalDocumentsError }}</p>
          <BaseButton type="submit">Upload requested documents</BaseButton>
        </form>
      </section>

      <section v-if="counselorApplication.status === 'MORE_INFORMATION_REQUIRED'" class="panel application-status-panel">
        <span class="section-kicker">Respond to the reviewer</span>
        <form class="settings-form" @submit.prevent="submitApplicantResponse">
          <Field label="Additional information" hint="Do not include sensitive information that was not requested">
            <textarea v-model="applicantResponse" class="control textarea" rows="4" maxlength="3000" required />
          </Field>
          <p v-if="applicantResponseError" class="form-error" role="alert">{{ applicantResponseError }}</p>
          <BaseButton type="submit">Send response securely</BaseButton>
        </form>
      </section>
    </template>
  </AppShell>

  <AppShell v-else-if="route.name === 'seeker-dashboard'" :title="dashboardTitle" eyebrow="Your private space">
    <Notice v-if="account.user && !state.demo && !['anonymous', 'registered'].includes(account.user.role)" title="This page is not available">Your role does not have access to a seeker dashboard.</Notice>
    <div v-else class="dashboard-grid">
      <section class="welcome-panel"><div><Badge tone="success">You’re not alone</Badge><h2>How are you doing today?</h2><p>Your next step can be small. Continue a conversation, revisit guidance, or simply pause for prayer.</p><p v-if="account.user && !state.demo" class="dashboard-public-id">Your account ID <strong>{{ account.user.publicId }}</strong></p><div><BaseButton @click="go('/counseling')">Open counseling room <Icon name="ArrowRight" :size="17" /></BaseButton><BaseButton variant="ghost" @click="go('/guidance')">View saved guidance</BaseButton></div></div><span class="welcome-art"><Icon name="Leaf" :size="72" /></span></section>
      <section class="status-card">
        <div class="card-heading"><div><span class="section-kicker">Counseling request</span><h2>Your connection</h2></div><Badge v-if="request" :tone="request.status === 'Pending' ? 'warning' : 'success'">{{ request.status }}</Badge></div>
        <template v-if="request">
          <div class="connection-row"><span class="counselor-avatar avatar-mint">SK</span><div><strong>{{ request.counselor }}</strong><small>{{ request.topic }}</small></div></div>
          <div class="status-timeline"><span class="done"><Icon name="Check" :size="13" /></span><i /><span :class="request.status === 'Accepted' ? 'done' : 'current'"><Icon :name="request.status === 'Accepted' ? 'Check' : 'Clock3'" :size="13" /></span><i /><span><Icon name="MessageCircle" :size="13" /></span></div>
          <div class="timeline-labels"><span>Sent</span><span>{{ request.status === 'Accepted' ? 'Accepted' : 'Awaiting reply' }}</span><span>Conversation</span></div>
          <div class="card-actions"><BaseButton v-if="request.status === 'Pending'" variant="secondary" @click="changeRequestStatus('Cancelled')">Cancel request</BaseButton><BaseButton v-else @click="go('/counseling')">Open room</BaseButton><small>Reference {{ request.reference }}</small></div>
        </template>
        <div v-else class="empty-state"><span><Icon name="MessageCircle" :size="26" /></span><h3>No active request</h3><p>Choose an approved counselor when you’re ready.</p><BaseButton @click="go('/needs')">Find support</BaseButton></div>
      </section>
      <section class="journey-preview"><div class="card-heading"><div><span class="section-kicker">Counsel → Guide → Disciple</span><h2>Your journey</h2></div><RouterLink to="/journey">View journey</RouterLink></div><div class="journey-line"><div v-for="(stage, index) in journeyStages" :key="stage.name" :class="journeyStageCompleted(index) ? 'complete' : index === currentJourneyStage ? 'active' : ''"><span><Icon v-if="journeyStageCompleted(index)" name="Check" :size="13" /><template v-else>{{ index + 1 }}</template></span><small>{{ stage.name }}</small></div></div><p><strong>Next step:</strong> Agree on a simple follow-up with your counselor.</p></section>
      <section class="scripture-card"><span class="quote-mark">“</span><p>Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.</p><div><strong>Philippians 4:6</strong><RouterLink to="/guidance">Reflect on this <Icon name="ChevronRight" :size="16" /></RouterLink></div></section>
      <section class="quick-links"><h2>Quick actions</h2><button @click="go('/guidance')"><span><Icon name="BookOpen" :size="20" /></span><div><strong>Saved guidance</strong><small>Scripture and resources</small></div><Icon name="ChevronRight" /></button><button @click="go('/needs')"><span><Icon name="HeartHandshake" :size="20" /></span><div><strong>Find another counselor</strong><small>Browse approved profiles</small></div><Icon name="ChevronRight" /></button><button @click="go('/counseling')"><span><Icon name="Flag" :size="20" /></span><div><strong>Report a concern</strong><small>Contact safeguarding support</small></div><Icon name="ChevronRight" /></button></section>
    </div>
  </AppShell>

  <AppShell v-else-if="route.name === 'counselor-dashboard'" title="Counselor dashboard" eyebrow="Monday, October 12">
    <template v-if="state.demo || account.user?.role === 'counselor'" #action><BaseButton variant="secondary"><Icon name="CalendarDays" :size="17" /> Availability</BaseButton></template>
    <Notice v-if="account.user && !state.demo && account.user.role !== 'counselor'" title="This page is not available">Only an assigned counselor account can access the counselor workspace.</Notice>
    <template v-else>
    <div class="stats-row">
      <div><span><Icon name="HeartHandshake" :size="20" /></span><small>New requests</small><strong>{{ account.user && !state.demo ? counselorCases.filter((item) => item.status === 'Pending').length : request?.status === 'Pending' ? 1 : 0 }}</strong></div><div><span><Icon name="MessageCircle" :size="20" /></span><small>Active conversations</small><strong>{{ account.user && !state.demo ? realConversations.filter((item) => item.status === 'open').length : 4 }}</strong></div><div><span><Icon name="Users" :size="20" /></span><small>Disciples</small><strong>{{ account.user && !state.demo ? '—' : 7 }}</strong></div><div><span><Icon name="Clock3" :size="20" /></span><small>Follow-ups due</small><strong>{{ account.user && !state.demo ? '—' : 2 }}</strong></div>
    </div>
    <div class="dashboard-two-col">
      <section class="panel"><div class="card-heading"><div><span class="section-kicker">Needs your attention</span><h2>New requests</h2></div><Badge tone="warning">{{ request?.status === 'Pending' ? '1 new' : 'Up to date' }}</Badge></div>
        <template v-if="account.user && !state.demo">
          <article v-for="caseItem in counselorCases.filter((item) => item.status === 'Pending')" :key="String(caseItem.public_ref)" class="request-row"><span class="private-avatar"><Icon name="EyeOff" :size="20" /></span><div class="request-main"><div><strong>{{ caseItem.seeker_public_id }}</strong><Badge>Assigned case</Badge></div><h3>{{ caseItem.topic }}</h3><p>{{ caseItem.description || 'The seeker requested a private conversation.' }}</p><span><Icon name="Clock3" :size="14" /> {{ caseItem.need }}</span></div><div class="request-actions"><BaseButton @click="changeRequestStatus('Accepted', String(caseItem.public_ref))">Accept</BaseButton><BaseButton variant="secondary" @click="changeRequestStatus('Declined', String(caseItem.public_ref))">Decline</BaseButton></div></article>
          <div v-if="!counselorCases.some((item) => item.status === 'Pending')" class="empty-state"><span><Icon name="MessageCircle" :size="26" /></span><h3>No new requests</h3><p>New assigned requests will appear here.</p></div>
        </template>
        <template v-else>
          <article v-if="request?.status === 'Pending'" class="request-row"><span class="private-avatar"><Icon name="EyeOff" :size="20" /></span><div class="request-main"><div><strong>Private Seeker 184</strong><Badge>Private mode</Badge></div><h3>{{ request.topic }}</h3><p>{{ request.description || 'I would appreciate a private conversation and some Biblical guidance.' }}</p><span><Icon name="Clock3" :size="14" /> Received today · {{ request.need }}</span></div><div class="request-actions"><BaseButton @click="changeRequestStatus('Accepted')">Accept</BaseButton><BaseButton variant="secondary" @click="changeRequestStatus('Declined')">Decline</BaseButton></div></article>
          <div v-else class="empty-state"><span><Icon name="MessageCircle" :size="26" /></span><h3>No new requests</h3><p>New assigned requests will appear here.</p></div>
        </template>
      </section>
      <section class="panel"><div class="card-heading"><div><span class="section-kicker">Continue care</span><h2>Active conversations</h2></div><RouterLink to="/counseling">View all</RouterLink></div>
        <template v-if="account.user && !state.demo"><button v-for="conversation in realConversations" :key="String(conversation.public_id)" class="conversation-row" @click="currentConversation = { publicId: String(conversation.public_id), otherPartyPublicId: String(conversation.other_party_public_id), otherPartyName: conversation.other_party_display_name, status: String(conversation.status) }; go('/counseling')"><span class="private-avatar"><Icon name="EyeOff" :size="17" /></span><div><strong>{{ conversation.other_party_display_name || conversation.other_party_public_id }}</strong><small>Assigned private conversation</small></div><span>{{ conversation.status }}</span></button><p v-if="!realConversations.length" class="empty-state">No assigned conversations.</p></template>
        <button v-else v-for="(person, index) in [{ name: 'Private Seeker 052', message: 'Thank you. I’ll try that this week.', age: '12m' },{ name: 'A. Johnson', message: 'Can we discuss the passage again?', age: '2h' },{ name: 'Private Seeker 191', message: 'I have an update from our last chat.', age: '1d' }]" :key="person.name" class="conversation-row" @click="go('/counseling')"><span :class="index === 1 ? 'person-avatar' : 'private-avatar'">{{ index === 1 ? 'AJ' : '' }}<Icon v-if="index !== 1" name="EyeOff" :size="17" /></span><div><strong>{{ person.name }}</strong><small>{{ person.message }}</small></div><span>{{ person.age }}</span></button>
      </section>
    </div>
    <section v-if="state.demo" class="panel followup-panel"><div class="card-heading"><div><span class="section-kicker">This week</span><h2>Follow-ups</h2></div></div><div class="followup-list"><div><span>Today</span><strong>Private Seeker 052</strong><small>Prayer check-in · 3:00 PM</small><BaseButton variant="secondary" @click="go('/counseling')">Open conversation</BaseButton></div><div><span>Wed</span><strong>A. Johnson</strong><small>Bible study follow-up · 5:30 PM</small><BaseButton variant="secondary" @click="go('/counseling')">View details</BaseButton></div></div></section>
    </template>
  </AppShell>

  <AppShell v-else-if="route.name === 'counseling'" :title="`Private counseling${currentConversation ? ` · ${currentConversation.otherPartyName || currentConversation.otherPartyPublicId}` : ''}`" eyebrow="Active conversation">
    <template #action><BaseButton variant="danger" @click="leaveConversation"><Icon name="ArrowRight" :size="17" /> Quick Exit</BaseButton></template>
    <div class="room-layout">
      <section class="chat-panel">
        <header class="chat-person"><span class="counselor-avatar avatar-mint"><Icon v-if="account.user && !state.demo" name="EyeOff" :size="18" /><template v-else>SK</template></span><div><strong>{{ account.user && !state.demo ? currentConversation?.otherPartyName || currentConversation?.otherPartyPublicId || "No assigned conversation" : "Sarah K." }}</strong><small><span class="status-dot" /> {{ account.user && !state.demo ? currentConversation?.status === 'open' ? 'Assigned private conversation' : 'No open conversation' : 'GCML-approved counselor' }}</small></div><button @click="reportOpen = true"><Icon name="Flag" :size="17" /> Report a concern</button></header>
        <Notice title="Private conversation">Only you and your assigned counselor can access this room. Avoid unnecessary identifying information.</Notice>
        <div v-if="account.user && !state.demo && !currentConversation" class="messages"><div class="empty-state"><span><Icon name="MessageCircle" :size="26" /></span><h3>No assigned conversation</h3><p>When an assigned counselor accepts a request, the conversation will appear here.</p></div></div>
        <div v-else-if="state.demo || (currentConversation && currentConversation.status === 'open')" class="messages"><div v-for="message in state.messages" :key="message.id" :class="`message message-${message.from}`"><small>{{ message.from === 'seeker' ? 'You' : account.user && !state.demo ? currentConversation?.otherPartyName || currentConversation?.otherPartyPublicId : 'Sarah K.' }}</small><p>{{ message.text }}</p><span>{{ message.time }} · Sent</span></div></div>
        <p v-if="chatError" class="form-error" role="alert">{{ chatError }}</p>
        <div class="share-tools"><button @click="go('/guidance')"><Icon name="BookOpen" :size="17" /> Scripture</button><button @click="chatText = 'Could we pause and pray about this together?'"><Icon name="Heart" :size="17" /> Prayer</button><button @click="go('/guidance')"><Icon name="Plus" :size="17" /> Resource</button></div>
        <form v-if="state.demo || (currentConversation && currentConversation.status === 'open')" class="composer" @submit.prevent="submitMessage"><textarea v-model="chatText" class="control textarea" maxlength="4000" rows="2" placeholder="Type a private message…" aria-label="Message" /><BaseButton type="submit" aria-label="Send message"><Icon name="Send" /></BaseButton></form>
      </section>
      <aside class="room-aside"><div><span class="section-kicker">Conversation focus</span><h3>{{ state.need }}</h3><p>Started October 9, 2026</p></div><div><span class="section-kicker">Shared today</span><article><Icon name="BookOpen" :size="19" /><span><strong>Philippians 4:6–7</strong><small>Scripture · Saved</small></span></article></div><div class="safety-card"><Icon name="ShieldCheck" :size="22" /><h3>Need help?</h3><p>Report a concern without sharing more identity information.</p><button @click="reportOpen = true">Contact safeguarding</button></div></aside>
    </div>
    <div v-if="reportOpen" class="modal-backdrop" role="presentation" @mousedown.self="reportOpen = false"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="report-title"><span class="modal-icon"><Icon name="Flag" :size="24" /></span><h2 id="report-title">Report a concern</h2><p>Share only what the safeguarding team needs to review the concern. This does not provide emergency help.</p><Notice v-if="reportStatus" title="Update" tone="success">{{ reportStatus }}</Notice><Field v-else label="What happened?"><textarea v-model="reportText" class="control textarea" rows="5" maxlength="1000" /></Field><div class="modal-actions"><BaseButton variant="secondary" @click="reportOpen = false">Close</BaseButton><BaseButton v-if="!reportStatus" :disabled="reportLoading" @click="submitReport">{{ reportLoading ? 'Submitting…' : 'Submit securely' }}</BaseButton></div></div></div>
  </AppShell>

  <AppShell v-else-if="route.name === 'guidance'" title="Biblical guidance" eyebrow="Approved resources">
    <div class="guidance-intro"><div><Badge tone="blue"><Icon name="BookHeart" :size="14" /> Shared by your counselor</Badge><h2>Truth to carry into your week.</h2><p>Save what helps, return when you need it, and discuss questions with your counselor.</p></div><div class="saved-count"><strong>{{ state.savedResources.length }}</strong><small>saved resources</small></div></div>
    <div class="resource-grid"><article v-for="(resource, index) in resources" :key="resource.id" :class="index === 0 ? 'resource-card resource-featured' : 'resource-card'"><div class="resource-top"><span><Icon :name="resource.icon" :size="20" /></span><small>{{ resource.type }}</small><Badge tone="success">GCML approved</Badge></div><h2>{{ resource.title }}</h2><blockquote>{{ resource.body }}</blockquote><div class="reflection"><small>Reflect</small><p>{{ resource.prompt }}</p></div><BaseButton :variant="state.savedResources.includes(resource.id) ? 'secondary' : 'primary'" @click="toggleResource(resource.id)"><template v-if="state.savedResources.includes(resource.id)"><Icon name="Check" :size="16" /> Saved to my journey</template><template v-else><Icon name="Plus" :size="16" /> Add to my journey</template></BaseButton></article></div>
    <Notice title="A note about Scripture text">References and short excerpts shown in this demo must be checked for the approved translation and licensing before production publishing.</Notice>
  </AppShell>

  <AppShell v-else-if="route.name === 'journey'" title="My discipleship journey" eyebrow="Growing in Christ">
    <section class="journey-hero"><div><Badge tone="success"><Icon name="Sprout" :size="14" /> Stage {{ currentJourneyStage + 1 }} of 6</Badge><h2>Your journey is about faithful steps, not a score.</h2><p>Discipleship is voluntary. You can pause, decline, or talk with your counselor about a different next step.</p></div><div class="progress-ring"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="16" /><circle cx="21" cy="21" r="16" pathLength="100" :stroke-dasharray="`${((currentJourneyStage + 1) / 6) * 100} 100`" /></svg><span><strong>{{ Math.round(((currentJourneyStage + 1) / 6) * 100) }}%</strong><small>path viewed</small></span></div></section>
    <section class="journey-panel"><div class="journey-stages"><button v-for="(stage, index) in journeyStages" :key="stage.name" :class="journeyStageCompleted(index) ? 'completed' : index === currentJourneyStage ? 'current' : ''" @click="updateJourneyStage(index)"><span><Icon v-if="journeyStageCompleted(index)" name="Check" :size="16" /><template v-else>{{ index + 1 }}</template></span><div><small>Stage {{ index + 1 }}</small><strong>{{ stage.name }}</strong><p>{{ stage.detail }}</p></div><Badge v-if="index === currentJourneyStage" tone="blue">Current</Badge></button></div><aside class="next-step-card"><span class="section-kicker">Your next step</span><span class="next-icon"><Icon name="CalendarDays" :size="24" /></span><h2>Plan a follow-up</h2><p>Agree with your counselor on a suitable next conversation or action.</p><BaseButton @click="updateJourneyStage(Math.min(5, currentJourneyStage + 1))">Mark next step viewed</BaseButton><small>Milestone definitions await GCML approval; this preview is not an authoritative progress score.</small></aside></section>
  </AppShell>

  <AppShell v-else-if="route.name === 'admin'" title="Administration" eyebrow="GCML operations">
    <template v-if="state.demo || account.user?.role === 'superadmin'" #action><BaseButton @click="changeAdminTab('Users')"><Icon name="Users" :size="17" /> Manage users</BaseButton></template>
    <Notice v-if="account.user && !state.demo && account.user.role !== 'superadmin'" title="This page is not available">Your account does not have SuperAdmin permissions.</Notice>
    <template v-else>
    <Notice :title="state.demo ? 'Synthetic administration preview' : 'Administrative privacy boundary'">{{ state.demo ? 'This demo contains no real counselor vetting or seeker records. Production admin access is permission-scoped by GCML.' : 'Account management and small-cohort reports are available here. SuperAdmin access does not grant access to private counseling messages.' }}</Notice>
    <div class="admin-tabs"><button v-for="tab in adminTabs" :key="tab" :class="{ active: adminTab === tab }" @click="changeAdminTab(tab)">{{ tab }}</button></div>
    <section v-if="adminTab === 'Counselor Applications' && !state.demo" class="admin-application-workspace">
      <section v-if="adminNotifications.length" class="panel application-status-panel">
        <span class="section-kicker">Application notifications</span>
        <article v-for="notification in adminNotifications" :key="notification.id" class="application-notification">
          <strong>{{ notification.title }}</strong>
          <p>{{ notification.message }}</p>
          <div class="application-notification-actions">
            <small>{{ new Date(notification.created_at).toLocaleString() }}</small>
            <button class="inline-action" @click="markAdminNotificationRead(notification.id)">Mark read</button>
          </div>
        </article>
      </section>
      <div class="application-status-counts">
        <button
          v-for="status in adminApplicationStatuses"
          :key="status"
          :class="{ active: adminApplicationStatus === status }"
          @click="adminApplicationStatus = status"
        >
          <strong>{{ adminApplicationCounts[status] || 0 }}</strong>
          <span>{{ status.replace(/_/g, " ") }}</span>
        </button>
      </div>
      <section class="panel admin-panel">
        <div class="table-tools">
          <label class="search-control"><Icon name="Search" :size="18" /><input v-model="adminSearch" placeholder="Search applicant or reference" /></label>
          <select v-model="adminApplicationStatus" class="control" aria-label="Application status">
            <option>All statuses</option>
            <option v-for="status in adminApplicationStatuses" :key="status" :value="status">{{ status.replace(/_/g, " ") }}</option>
          </select>
        </div>
        <div class="data-table application-list">
          <div class="table-row table-head"><span>Applicant</span><span>Requested role</span><span>Application</span><span>Submitted</span><span /></div>
          <div v-for="application in filteredAdminApplications" :key="application.publicRef" class="table-row">
            <span data-label="Applicant"><b>{{ application.preferredDisplayName }}</b><small>{{ application.fullLegalName }} · {{ application.publicId }}</small></span>
            <span data-label="Requested role">{{ application.professionalTitle ? `${application.professionalTitle} · ` : "" }}{{ application.specialization }}</span>
            <span data-label="Application"><Badge tone="warning">{{ application.status.replace(/_/g, " ") }}</Badge></span>
            <span data-label="Submitted">{{ new Date(application.submittedAt).toLocaleDateString() }}</span>
            <button class="inline-action" @click="openAdminApplication(application.publicRef)">Review</button>
          </div>
          <div v-if="!filteredAdminApplications.length" class="application-empty">
            No applications match this status filter.
          </div>
        </div>
      </section>

      <p v-if="adminApplicationError" class="form-error" role="alert">{{ adminApplicationError }}</p>
      <section v-if="adminApplicationLoading" class="panel application-review-panel">
        <p>Loading applicant details…</p>
      </section>
      <section v-else-if="adminApplication" class="panel application-review-panel">
        <div class="card-heading">
          <div><span class="section-kicker">Application {{ adminApplication.publicRef }}</span><h2>{{ adminApplication.fullLegalName }}</h2></div>
          <div class="application-decision-actions">
            <Badge tone="warning">{{ adminApplication.status.replace(/_/g, " ") }}</Badge>
            <BaseButton v-if="!['APPROVED', 'REJECTED'].includes(adminApplication.status)" :disabled="adminApplication.accountStatus !== 'active'" @click="submitAdminApplicationReview('APPROVED')">Approve</BaseButton>
          </div>
        </div>
        <dl class="application-detail-grid">
          <div><dt>Preferred display name</dt><dd>{{ adminApplication.preferredDisplayName }}</dd></div>
          <div><dt>Account / email</dt><dd>{{ adminApplication.publicId }} · {{ adminApplication.email }}</dd></div>
          <div><dt>Specialization</dt><dd>{{ adminApplication.specialization }}</dd></div>
          <div><dt>Short biography</dt><dd>{{ adminApplication.biography }}</dd></div>
        </dl>

        <details class="application-optional-details">
          <summary>Optional professional details, credentials, and documents</summary>
          <div class="application-optional-content">
            <dl class="application-detail-grid">
              <div><dt>Phone</dt><dd>{{ adminApplication.phone || "Not provided" }}</dd></div>
              <div><dt>Location</dt><dd>{{ [adminApplication.generalLocation, adminApplication.country].filter(Boolean).join(", ") || "Not provided" }}</dd></div>
              <div><dt>Professional title</dt><dd>{{ adminApplication.professionalTitle || "Not provided" }}</dd></div>
          <div><dt>Highest qualification (applicant-provided)</dt><dd>{{ [adminApplication.highestQualification, adminApplication.qualificationType, adminApplication.institution].filter(Boolean).join(" · ") || "Not provided" }}<span v-if="adminApplication.completionYear"> · {{ adminApplication.completionYear }}</span></dd></div>
          <div><dt>Experience</dt><dd>{{ adminApplication.yearsExperience === null ? "Not provided" : `${adminApplication.yearsExperience} years` }}</dd></div>
          <div><dt>Certifications</dt><dd>{{ adminApplication.certifications || "Not provided" }}</dd></div>
          <div><dt>License / registration</dt><dd>{{ adminApplication.licenseNumber || "Not applicable or not provided" }}<span v-if="adminApplication.licensingAuthority"> · {{ adminApplication.licensingAuthority }}</span><span v-if="adminApplication.licenseExpiry"> · Expires {{ adminApplication.licenseExpiry }}</span></dd></div>
          <div><dt>Areas of expertise</dt><dd>{{ adminApplication.areasOfExpertise.join(", ") || "Not provided" }}</dd></div>
          <div><dt>Languages</dt><dd>{{ adminApplication.languages.join(", ") || "Not provided" }}</dd></div>
          <div class="application-detail-wide"><dt>Work history</dt><dd>{{ adminApplication.workHistory || "Not provided" }}</dd></div>
          <div class="application-detail-wide"><dt>References</dt><dd>{{ adminApplication.referencesText || "Not provided" }}</dd></div>
            </dl>
            <Notice title="Platform approval is separate from professional verification">
              Applicant-submitted qualifications and licenses are not treated as verified until a reviewer verifies them. Conduct: {{ adminApplication.codeOfConductAccepted ? "accepted" : "not accepted" }} · Confidentiality: {{ adminApplication.confidentialityAccepted ? "accepted" : "not accepted" }} · Safeguarding: {{ adminApplication.safeguardingAccepted ? "accepted" : "not accepted" }}
            </Notice>

            <div class="application-review-section">
              <h3>Optional professional credential verification</h3>
              <p class="field-hint">Account approval grants platform access; it does not certify professional qualifications or licensure. Verify credentials separately when provided and applicable.</p>
              <div v-for="qualification in adminApplication.qualifications" :key="qualification.id" class="verification-row">
                <span><strong>{{ qualification.qualification }}</strong><small>{{ qualification.qualificationType }} · {{ qualification.institution }}<template v-if="qualification.completionYear"> · {{ qualification.completionYear }}</template></small></span>
                <Badge :tone="qualification.verificationStatus === 'verified' ? 'success' : 'warning'">{{ qualification.verificationStatus }}</Badge>
                <BaseButton variant="secondary" :disabled="adminCredentialReason.trim().length < 5 || qualification.verificationStatus === 'verified'" @click="verifyApplicationCredential('qualification', true, qualification.id)">Mark verified</BaseButton>
                <BaseButton variant="secondary" :disabled="adminCredentialReason.trim().length < 5 || qualification.verificationStatus === 'not_verified'" @click="verifyApplicationCredential('qualification', false, qualification.id)">Not verified</BaseButton>
              </div>
              <p v-if="!adminApplication.qualifications.length && !adminApplication.licenseNumber">No optional professional credentials provided.</p>
              <Field v-if="adminApplication.qualifications.length || adminApplication.licenseNumber" label="Credential verification reason"><textarea v-model="adminCredentialReason" class="control textarea" rows="2" minlength="5" maxlength="1000" /></Field>
              <div v-if="adminApplication.licenseNumber" class="verification-row">
                <span><strong>Professional license</strong><small>{{ adminApplication.licensingAuthority || "Licensing authority not provided" }} · {{ adminApplication.licenseNumber }}</small></span>
                <Badge :tone="adminApplication.licenseVerified ? 'success' : 'warning'">{{ adminApplication.licenseVerified ? "verified" : "unverified" }}</Badge>
                <BaseButton variant="secondary" :disabled="adminCredentialReason.trim().length < 5 || adminApplication.licenseVerified" @click="verifyApplicationCredential('license', true)">Mark verified</BaseButton>
                <BaseButton variant="secondary" :disabled="adminCredentialReason.trim().length < 5 || !adminApplication.licenseVerified" @click="verifyApplicationCredential('license', false)">Not verified</BaseButton>
              </div>
            </div>

            <div class="application-review-section">
              <h3>Optional private documents</h3>
              <div v-if="adminApplication.documents.length" class="application-document-list">
                <div v-for="document in adminApplication.documents" :key="document.id">
                  <span><strong>{{ document.category.replace(/_/g, " ") }}</strong><small>{{ document.originalName || "Requested; not uploaded" }}<template v-if="document.byteSize"> · {{ Math.ceil(document.byteSize / 1024) }} KB</template></small></span>
                  <a v-if="document.status === 'uploaded'" class="inline-action" :href="adminApplicationDocumentUrl(document)">Download privately</a>
                  <Badge v-else tone="warning">Requested</Badge>
                </div>
              </div>
              <p v-else>No documents provided.</p>
              <div v-for="response in adminApplication.responses" :key="response.created_at" class="application-notification">
                <strong>Applicant response</strong><p>{{ response.message }}</p><small>{{ new Date(response.created_at).toLocaleString() }}</small>
              </div>
            </div>
          </div>
        </details>

        <div v-if="adminApplication.reviews.length" class="application-review-section">
          <h3>Review history</h3>
          <article v-for="(review, index) in adminApplication.reviews" :key="`${review.action}-${review.createdAt}-${index}`" class="application-notification">
            <strong>{{ review.action.replace(/_/g, " ") }} · {{ review.reviewerName || review.reviewerPublicId }}</strong>
            <p>{{ review.reason }}</p>
            <small>{{ new Date(review.createdAt).toLocaleString() }}</small>
          </article>
        </div>

        <div class="application-review-section">
          <h3>Record a decision</h3>
          <Field label="Decision reason" hint="Required for rejection or an information request; optional for approval"><textarea v-model="adminReviewReason" class="control textarea" rows="3" maxlength="3000" /></Field>
          <fieldset v-if="!['APPROVED', 'REJECTED'].includes(adminApplication.status)" class="requested-document-options">
            <legend>Optional documents to request</legend>
            <label v-for="category in ['qualification', 'license', 'supporting']" :key="category" class="check-label">
              <input v-model="adminDocumentCategories" type="checkbox" :value="category" />
              <span>{{ category }} documents (optional)</span>
            </label>
          </fieldset>
          <div class="application-decision-actions">
            <BaseButton v-if="!['APPROVED', 'REJECTED'].includes(adminApplication.status)" variant="secondary" :disabled="adminReviewReason.trim().length < 5" @click="submitAdminApplicationReview('MORE_INFORMATION_REQUIRED')">Request information</BaseButton>
            <BaseButton v-if="!['APPROVED', 'REJECTED'].includes(adminApplication.status)" variant="danger" :disabled="adminReviewReason.trim().length < 5" @click="submitAdminApplicationReview('REJECTED')">Reject application</BaseButton>
            <BaseButton v-if="adminApplication.status === 'APPROVED'" :variant="adminApplication.accountStatus === 'active' ? 'danger' : 'secondary'" @click="toggleApplicantSuspension">{{ adminApplication.accountStatus === 'active' ? 'Suspend counselor' : 'Reactivate counselor' }}</BaseButton>
          </div>
        </div>
      </section>
    </section>
    <section v-else-if="adminTab === 'Counselors'" class="panel admin-panel">
      <div class="table-tools"><label class="search-control"><Icon name="Search" :size="18" /><input v-model="adminSearch" placeholder="Search counselor profiles" /></label><select v-if="state.demo" v-model="adminStatus" class="control" aria-label="Approval status"><option>All statuses</option><option>Approved</option><option>Pending review</option><option>Suspended</option></select></div>
      <div v-if="state.demo" class="data-table"><div class="table-row table-head"><span>Counselor</span><span>Service areas</span><span>Approval</span><span>Availability</span><span /></div>
        <div v-for="row in filteredAdminRows" :key="row.name" class="table-row"><span data-label="Counselor"><i :class="`counselor-avatar avatar-sm avatar-${row.color}`">{{ counselorInitials(row.name) }}</i><b>{{ row.name }}</b></span><span data-label="Service areas">{{ row.areas }}</span><span data-label="Approval"><Badge :tone="row.approval === 'Approved' ? 'success' : 'warning'">{{ row.approval }}</Badge></span><span data-label="Availability">{{ row.availability }}</span><button :aria-label="`Actions for ${row.name}`"><Icon name="MoreHorizontal" :size="19" /></button></div>
      </div>
      <div v-else class="data-table"><div class="table-row table-head"><span>Counselor</span><span>Service areas</span><span>Approval</span><span>Account</span><span /></div>
        <div v-for="user in adminSearchResults" :key="user.publicId" class="table-row"><span data-label="Counselor"><b>{{ user.displayName || user.publicId }}</b><small>{{ user.publicId }}</small></span><span data-label="Service areas">{{ user.areas?.join(', ') || 'Not set' }}</span><span data-label="Approval"><Badge :tone="user.approved ? 'success' : 'warning'">{{ user.approved ? 'Approved' : 'Legacy record' }}</Badge></span><span data-label="Account">{{ user.status }}</span><span /></div>
      </div>
    </section>
    <section v-else-if="adminTab === 'Users' && !state.demo" class="panel admin-panel">
      <label class="search-control"><Icon name="Search" :size="18" /><input v-model="adminSearch" placeholder="Search by public ID or display name" /></label>
      <Notice title="Account access">Changing a status revokes existing sessions. Staff roles never grant message access by themselves.</Notice>
      <div class="data-table"><div class="table-row table-head"><span>Account</span><span>Type</span><span>Role</span><span>Status</span><span>Created</span></div>
        <div v-for="user in adminSearchResults" :key="user.publicId" class="table-row"><span data-label="Account"><b>{{ user.displayName || 'Private account' }}</b><small>{{ user.publicId }}</small></span><span data-label="Type">{{ user.accountType }}</span><span data-label="Role"><select v-if="user.accountType === 'registered' && user.role !== 'counselor'" class="control compact-select" :value="user.role" @change="selectAdminRole(user, $event)"><option value="registered">Registered user</option><option value="superadmin">SuperAdmin</option></select><span v-else-if="user.accountType === 'counselor'">{{ user.role === 'counselor' ? 'Approved counselor' : 'Counselor applicant' }}</span><span v-else-if="user.role === 'counselor'">Legacy counselor</span><span v-else>Anonymous user</span></span><span data-label="Status"><select class="control compact-select" :value="user.status" @change="selectAdminStatus(user, $event)"><option value="active">Active</option><option value="suspended">Suspended</option><option value="deactivated">Deactivated</option></select></span><span data-label="Created">{{ new Date(user.createdAt).toLocaleDateString() }}</span></div>
      </div>
    </section>
    <section v-else-if="adminTab === 'Safeguarding' && !state.demo" class="panel admin-panel">
      <Notice title="Explicit safeguarding access">Only accounts granted the separate safeguarding-review permission may read report content. This screen does not display or unlock counseling messages.</Notice>
      <div class="data-table"><div class="table-row table-head"><span>Account</span><span>Role</span><span>Status</span><span>Review access</span><span /></div>
        <div v-for="user in adminSearchResults" :key="user.publicId" class="table-row"><span data-label="Account">{{ user.displayName || user.publicId }}<small>{{ user.publicId }}</small></span><span data-label="Role">{{ user.role }}</span><span data-label="Status">{{ user.status }}</span><span data-label="Review access">{{ user.safeguardingReview ? 'Granted' : 'Not granted' }}</span><button class="inline-action" @click="toggleSafeguardingPermission(user)">{{ user.safeguardingReview ? 'Revoke' : 'Grant' }}</button></div>
      </div>
    </section>
    <section v-else-if="adminTab === 'Settings' && !state.demo" class="admin-settings-grid">
      <section class="panel settings-card">
        <span class="section-kicker">Public homepage</span>
        <h2>Homepage image</h2>
        <p>Choose the photo shown in the homepage hero. The image is stored in PostgreSQL so it remains available after the API restarts. JPEG, PNG, and WebP files up to 5 MB are supported.</p>
        <div v-if="homepageSettingsLoading" class="settings-image-preview settings-image-empty" role="status">
          Loading current homepage image…
        </div>
        <div v-else class="settings-image-preview">
          <img
            v-if="homepageImagePreview || homepageImageUrl"
            :src="homepageImagePreview || apiUrl(homepageImageUrl || '')"
            :alt="homepageImagePreview ? homepageImageAltDraft : homepageImageAlt"
          />
          <div v-else class="settings-image-empty">The homepage is using its original artwork.</div>
        </div>
        <small v-if="homepageImageUpdatedAt" class="settings-image-updated">
          Last updated {{ new Date(homepageImageUpdatedAt).toLocaleString() }}
        </small>
        <form class="settings-form settings-site-form" @submit.prevent="saveHomepageImage">
          <Field label="Choose a homepage image" hint="JPEG, PNG, or WebP · maximum 5 MB">
            <input
              class="control file-control"
              type="file"
              ref="homepageImageInput"
              accept="image/jpeg,image/png,image/webp"
              @change="selectHomepageImage"
            />
          </Field>
          <Field label="Image description" hint="Describe the image for visitors using a screen reader.">
            <input
              v-model="homepageImageAltDraft"
              class="control"
              type="text"
              minlength="3"
              maxlength="160"
              required
              autocomplete="off"
            />
          </Field>
          <p v-if="homepageSettingsError" class="form-error" role="alert">{{ homepageSettingsError }}</p>
          <p v-if="homepageSettingsStatus" class="settings-success" role="status">{{ homepageSettingsStatus }}</p>
          <div class="settings-actions">
            <BaseButton type="submit" :disabled="homepageSettingsSaving || !homepageImageFile || homepageImageAltDraft.trim().length < 3">
              {{ homepageSettingsSaving ? 'Saving…' : 'Save homepage image' }}
            </BaseButton>
            <BaseButton
              v-if="homepageImageFile"
              type="button"
              variant="secondary"
              :disabled="homepageSettingsSaving"
              @click="clearHomepageImagePreview"
            >Cancel selection</BaseButton>
            <BaseButton
              v-if="homepageImageUrl"
              type="button"
              variant="danger"
              :disabled="homepageSettingsSaving"
              @click="removeHomepageImage"
            >Remove image</BaseButton>
          </div>
        </form>
      </section>
      <Notice title="Administrative settings">Homepage artwork changes are public and are recorded in the audit log. Access policies, safeguarding rules, and ministry content are intentionally not editable here; those require approved governance settings.</Notice>
    </section>
    <section v-else class="panel"><div class="empty-state"><span><Icon name="MessageCircle" :size="26" /></span><h3>{{ adminTab }} workspace</h3><p>{{ adminTabDescriptions[adminTab] }}</p><BaseButton variant="secondary">Review access policy</BaseButton></div></section>
    </template>
  </AppShell>

  <AppShell v-else-if="route.name === 'reports'" title="Impact reports" eyebrow="Aggregate insights">
    <template v-if="state.demo || account.user?.role === 'superadmin'" #action><BaseButton variant="secondary"><Icon name="Download" :size="17" /> Export summary</BaseButton></template>
    <Notice v-if="account.user && !state.demo && account.user.role !== 'superadmin'" title="This page is not available">Aggregate reports are limited to authorized SuperAdmins.</Notice>
    <template v-else>
    <Notice :title="state.demo ? 'Privacy-protective reporting preview' : 'Privacy-protective aggregate reporting'">{{ state.demo ? 'Metrics use synthetic data and exclude message content, private identities, and small-group breakdowns.' : 'Reports contain aggregate operational counts only. Counts below five are suppressed to reduce re-identification risk.' }}</Notice>
    <div v-if="state.demo" class="report-filters"><select class="control" aria-label="Reporting period"><option>Last 30 days</option><option>Last quarter</option></select><select class="control" aria-label="Need area"><option>All need areas</option><option>Prayer &amp; spiritual growth</option></select></div>
    <div class="stats-row reports"><div><span><Icon name="Users" :size="20" /></span><small>{{ state.demo ? 'People connected' : 'Total accounts' }}</small><strong>{{ state.demo ? '184' : reportValue('accounts') }}</strong><em>{{ state.demo ? '+12% vs prior period' : 'Small totals are suppressed' }}</em></div><div><span><Icon name="HeartHandshake" :size="20" /></span><small>Requests accepted</small><strong>{{ state.demo ? '142' : reportValue('accepted_requests') }}</strong><em>{{ state.demo ? '77% of requests' : 'Aggregate only' }}</em></div><div><span><Icon name="MessageCircle" :size="20" /></span><small>Active engagements</small><strong>{{ state.demo ? '68' : reportValue('open_conversations') }}</strong><em>Aggregate only</em></div><div><span><Icon name="Sprout" :size="20" /></span><small>{{ state.demo ? 'Discipleship invitations' : 'Completed path stages' }}</small><strong>{{ state.demo ? '39' : reportValue('completed_stages') }}</strong><em>Voluntary participation</em></div></div>
    <div v-if="state.demo" class="reports-grid"><section class="panel chart-panel"><div class="card-heading"><div><span class="section-kicker">Connection trend</span><h2>Requests and accepted connections</h2></div><Icon name="BarChart3" :size="22" /></div><div class="bar-chart"><div v-for="bar in reportBars" :key="bar.label"><div class="bars"><i :style="{ height: `${bar.total}%` }" /><i :style="{ height: `${bar.accepted}%` }" /></div><span>{{ bar.label }}</span></div></div><div class="chart-legend"><span><i /> Requests</span><span><i /> Accepted</span></div></section>
      <section class="panel need-report"><div class="card-heading"><div><span class="section-kicker">Top support areas</span><h2>Needs selected</h2></div></div><div v-for="item in reportNeeds" :key="item.label"><span><b>{{ item.label }}</b><small>{{ item.value }}%</small></span><i><em :style="{ width: `${item.value}%` }" /></i></div></section></div>
    <p class="report-footnote">A “connection” means a counseling request accepted by its assigned counselor. Targets, substantive-engagement definitions, and journey completion rules require GCML approval before production reporting.</p>
    </template>
  </AppShell>

  <AppShell v-else-if="route.name === 'account-settings'" title="Account settings" eyebrow="Your ShepherdConnect account">
    <Notice v-if="!account.user && !state.demo" title="Sign in to manage your account">
      Your private account settings are available after sign-in.
      <RouterLink to="/sign-in">Sign in securely</RouterLink>
    </Notice>
    <template v-else-if="account.user && !state.demo">
      <section class="panel settings-card">
        <div class="card-heading"><div><span class="section-kicker">Account identity</span><h2>{{ account.user.displayName || "Private account" }}</h2></div><Badge tone="success">{{ account.user.status }}</Badge></div>
        <dl class="account-details"><div><dt>Public account ID</dt><dd>{{ account.user.publicId }}</dd></div><div><dt>Account type</dt><dd>{{ account.user.accountType === 'anonymous' ? 'Private / anonymous' : account.user.accountType === 'counselor' ? 'Counselor account' : 'Regular user' }}</dd></div><div><dt>Access role</dt><dd>{{ account.user.role }}</dd></div><div><dt>Real-world identity</dt><dd>{{ account.user.accountType === 'anonymous' ? 'Not required' : 'Email provided' }}</dd></div></dl>
        <form v-if="account.user.role !== 'counselor'" class="settings-form" @submit.prevent="saveDisplayName">
          <Field label="Display name" :hint="account.user.accountType === 'anonymous' ? 'Optional. Leave blank to remain a private account.' : 'Shown on your account and to people you connect with.'">
            <input v-model="displayNameDraft" class="control" maxlength="80" autocomplete="nickname" />
          </Field>
          <BaseButton type="submit" variant="secondary" :disabled="profileLoading">{{ profileLoading ? 'Saving…' : 'Save display name' }}</BaseButton>
        </form>
        <Notice title="Recovery and privacy">Your public ID is for identification in ShepherdConnect, not authentication. Keep your password and one-time recovery code private. Private mode avoids requiring real-world identity, but does not guarantee technical untraceability.</Notice>
        <div class="settings-actions"><BaseButton variant="secondary" :disabled="profileLoading" @click="rotateRecoveryCode">{{ profileLoading ? 'Please wait…' : 'Rotate recovery code' }}</BaseButton><BaseButton variant="danger" :disabled="profileLoading" @click="deactivateAccount">Deactivate account</BaseButton></div>
        <p v-if="profileStatus && !recoveryCode" class="form-error" role="alert">{{ profileStatus }}</p>
        <div v-if="recoveryCode" class="recovery-display settings-recovery" aria-live="polite"><strong>{{ profileStatus }}</strong><code>{{ recoveryCode }}</code><BaseButton variant="secondary" @click="copyRecoveryCode">{{ recoveryCopied ? 'Copied' : 'Copy recovery code' }}</BaseButton><small>This code is shown only now. Save it securely; the old code is invalid.</small></div>
      </section>
      <section
        v-if="account.user.accountType === 'registered' && account.user.role === 'registered'"
        class="panel settings-card"
      >
        <span class="section-kicker">Counselor application</span>
        <h2>Apply using this account</h2>
        <p>Your existing email, password, and account history will stay with this account. Counselor features remain unavailable unless a SuperAdmin approves your application.</p>
        <CounselorRegistrationForm
          :busy="authLoading"
          :error="authStatus"
          :existing-account="true"
          @submit="submitCounselorApplication"
        />
      </section>
      <section class="panel settings-card">
        <span class="section-kicker">Sign-in security</span><h2>Change password</h2>
        <p>Confirm your current password to choose a new one. Other active sessions will be signed out; this session will stay active.</p>
        <form class="settings-form" @submit.prevent="changeAccountPassword">
          <Field label="Current password"><input v-model="currentPassword" class="control" type="password" minlength="1" maxlength="128" required autocomplete="current-password" /></Field>
          <Field label="New password" hint="Use at least 12 characters."><input v-model="newAccountPassword" class="control" type="password" minlength="12" maxlength="128" required autocomplete="new-password" /></Field>
          <Field label="Confirm new password"><input v-model="confirmAccountPassword" class="control" type="password" minlength="12" maxlength="128" required autocomplete="new-password" /></Field>
          <p v-if="passwordStatus" :class="passwordStatus.startsWith('Password updated') ? 'settings-success' : 'form-error'" :role="passwordStatus.startsWith('Password updated') ? 'status' : 'alert'">{{ passwordStatus }}</p>
          <BaseButton type="submit" :disabled="passwordLoading">{{ passwordLoading ? 'Updating…' : 'Update password' }}</BaseButton>
        </form>
      </section>
      <section v-if="account.user.accountType === 'anonymous'" class="panel settings-card">
        <span class="section-kicker">Optional upgrade</span><h2>Register this account</h2>
        <p>Adding an email address and display name changes your account type. Your internal account linkage, eligible requests, conversations, and journey records stay attached. Your counselor is not automatically told your real-world identity.</p>
        <form class="settings-form" @submit.prevent="upgradeAccount">
          <Field label="Display name"><input v-model="upgradeName" class="control" required maxlength="80" /></Field>
          <Field label="Email"><input v-model="upgradeEmail" class="control" type="email" required autocomplete="email" /></Field>
          <Field label="New password"><input v-model="upgradePassword" class="control" type="password" minlength="12" maxlength="128" required autocomplete="new-password" /></Field>
          <label class="check-label"><input v-model="upgradeConsent" type="checkbox" required /><span>I understand what information will be added and consent to upgrade this account.</span></label>
          <p v-if="profileStatus && !recoveryCode" class="form-error" role="alert">{{ profileStatus }}</p>
          <BaseButton type="submit" :disabled="profileLoading">{{ profileLoading ? 'Upgrading…' : 'Upgrade account' }}</BaseButton>
        </form>
      </section>
      <section v-if="account.user.role === 'counselor'" class="panel settings-card">
        <span class="section-kicker">Approved counselor profile</span><h2>Update your professional profile when you choose</h2>
        <p>These details are optional and can be added or updated after approval. Professional credentials remain unverified until reviewed separately.</p>
        <form class="settings-form" @submit.prevent="saveCounselorProfile">
          <Field label="Public display name"><input v-model="displayNameDraft" class="control" maxlength="80" required autocomplete="nickname" /></Field>
          <Field label="Professional title — optional"><input v-model="counselorProfessionalTitle" class="control" maxlength="120" placeholder="e.g. Pastoral counselor" /></Field>
          <Field label="Profile headline — optional"><input v-model="counselorHeadline" class="control" maxlength="120" /></Field>
          <Field label="Short biography — optional" hint="Up to 5000 characters"><textarea v-model="counselorBio" class="control textarea" rows="4" maxlength="5000" /></Field>
          <Field label="Counseling specialization" hint="Separate items with commas"><input v-model="counselorAreas" class="control" maxlength="1000" /></Field>
          <Field label="Languages spoken — optional" hint="Separate items with commas"><input v-model="counselorLanguages" class="control" maxlength="1000" /></Field>
          <Field label="Highest qualification — optional"><input v-model="counselorHighestQualification" class="control" maxlength="180" /></Field>
          <Field label="Institution — optional"><input v-model="counselorInstitution" class="control" maxlength="180" /></Field>
          <Field label="Qualification type — optional"><input v-model="counselorQualificationType" class="control" maxlength="120" /></Field>
          <Field label="Completion year — optional"><input v-model="counselorCompletionYear" class="control" type="number" min="1900" max="2100" /></Field>
          <Field label="Years of relevant experience — optional"><input v-model="counselorYearsExperience" class="control" type="number" min="0" max="80" /></Field>
          <Field label="Certifications — optional"><textarea v-model="counselorCertifications" class="control textarea" rows="3" maxlength="3000" /></Field>
          <Field label="Professional license or registration — optional"><input v-model="counselorLicenseNumber" class="control" maxlength="160" /></Field>
          <Field label="Licensing authority — optional"><input v-model="counselorLicensingAuthority" class="control" maxlength="180" /></Field>
          <Field label="License expiry — optional"><input v-model="counselorLicenseExpiry" class="control" type="date" /></Field>
          <Field label="Relevant work history — optional"><textarea v-model="counselorWorkHistory" class="control textarea" rows="4" maxlength="5000" /></Field>
          <Field label="Professional references — optional" hint="Share only information you are authorized to provide"><textarea v-model="counselorReferences" class="control textarea" rows="3" maxlength="3000" /></Field>
          <p v-if="profileStatus && !recoveryCode" class="form-error" role="alert">{{ profileStatus }}</p>
          <BaseButton type="submit" :disabled="profileLoading">{{ profileLoading ? 'Saving…' : 'Save counselor profile' }}</BaseButton>
        </form>
        <div class="application-review-section">
          <h3>Optional supporting documents</h3>
          <p class="field-hint">Upload documents only if you choose to add them. PDF, JPEG, or PNG; maximum 10 MB per file and five files per submission. Profile photos must be JPEG or PNG.</p>
          <div v-if="counselorProfileDocuments.length" class="application-document-list">
            <div v-for="document in counselorProfileDocuments" :key="document.id">
              <span><strong>{{ document.category.replace(/_/g, ' ') }}</strong><small>{{ document.original_name || 'Document' }}<template v-if="document.byte_size"> · {{ Math.ceil(document.byte_size / 1024) }} KB</template></small></span>
              <a v-if="document.status === 'uploaded'" class="inline-action" :href="counselorProfileDocumentUrl(document)">Download privately</a>
            </div>
          </div>
          <p v-else>No documents added.</p>
          <form class="settings-form" @submit.prevent="uploadCounselorProfileDocuments">
            <Field label="Qualification certificates — optional"><input class="control file-control" type="file" name="qualificationDocuments" accept=".pdf,.jpg,.jpeg,.png" multiple /></Field>
            <Field label="License or registration evidence — optional"><input class="control file-control" type="file" name="licenseDocuments" accept=".pdf,.jpg,.jpeg,.png" multiple /></Field>
            <Field label="Additional supporting documents — optional"><input class="control file-control" type="file" name="supportingDocuments" accept=".pdf,.jpg,.jpeg,.png" multiple /></Field>
            <Field label="Profile photograph — optional" hint="JPEG or PNG"><input class="control file-control" type="file" name="profilePhoto" accept=".jpg,.jpeg,.png" /></Field>
            <p v-if="counselorDocumentStatus" :class="counselorDocumentStatus.includes('uploaded') ? 'settings-success' : 'form-error'" role="status">{{ counselorDocumentStatus }}</p>
            <BaseButton type="submit" variant="secondary" :disabled="profileLoading">{{ profileLoading ? 'Uploading…' : 'Upload selected documents' }}</BaseButton>
          </form>
        </div>
      </section>
    </template>
    <Notice v-else title="Demo workspace">Account settings and recovery are not connected in the synthetic demo. Create a private or registered account to use these controls.</Notice>
  </AppShell>

  <div v-else-if="route.name === 'safe'" class="safe-page">
    <div class="safe-header"><Brand /></div><main><span><Icon name="Leaf" :size="36" /></span><h1>Welcome</h1><p>You have left the private conversation. Use the links below to visit neutral public resources.</p><div><a href="https://www.google.com">Search the web</a><a href="https://www.bbc.com">Read the news</a></div></main>
  </div>

  <main v-else class="not-found">
    <RouterLink to="/" class="not-found-brand"><Brand /></RouterLink>
    <section class="not-found-content" aria-labelledby="not-found-title">
      <div class="not-found-icon" aria-hidden="true">
        <Icon name="Search" :size="31" />
      </div>
      <span class="not-found-code">Error 404</span>
      <h1 id="not-found-title">We can’t find that page.</h1>
      <p>
        The address may be incorrect, or the page may have moved. You can return
        to ShepherdConnect or continue to one of these helpful pages.
      </p>
      <div class="not-found-actions">
        <RouterLink class="btn btn-primary" to="/">
          <Icon name="Home" :size="17" /> Go to home
        </RouterLink>
        <RouterLink class="btn btn-secondary" to="/privacy">
          Find support <Icon name="ArrowRight" :size="17" />
        </RouterLink>
      </div>
      <RouterLink class="not-found-sign-in" to="/sign-in">
        Already have an account? Sign in
      </RouterLink>
    </section>
    <footer class="not-found-footer">
      <Brand compact />
      <span>Private counsel. Biblical guidance. Personal discipleship.</span>
    </footer>
  </main>
</template>
