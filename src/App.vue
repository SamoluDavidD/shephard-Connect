<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { journeyStages, needs } from "./data"
import { api, apiUrl, type AccountUser, type AuthResponse } from "./lib/api"
import { account, refreshAccount, setAccountUser } from "./lib/account"
import { useApp, type RequestStatus } from "./app/state"
import AppShell from "./components/AppShell.vue"
import Badge from "./components/Badge.vue"
import BaseButton from "./components/BaseButton.vue"
import Brand from "./components/Brand.vue"
import CounselorRegistrationForm from "./components/CounselorRegistrationForm.vue"
import AdminAnalytics from "./components/AdminAnalytics.vue"
import CounselorDisciples from "./components/CounselorDisciples.vue"
import Field from "./components/Field.vue"
import Icon from "./components/Icon.vue"
import Notice from "./components/Notice.vue"
import ProfileAvatar from "./components/ProfileAvatar.vue"

const route = useRoute()
const router = useRouter()
type CounselorApplicationSummary = {
  publicRef: string
  status: string
  fullLegalName: string
  preferredDisplayName: string
  professionalTitle: string | null
  specialization: string
  supportCategories: string[]
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
  supportCategories: string[]
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
type LiveConversation = {
  public_id: string
  status: string
  updated_at: string
  other_party_public_id: string
  other_party_display_name: string
  other_party_is_anonymous: boolean
  other_party_picture_url: string | null
}
type LiveMessage = {
  id: string
  body: string
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  delivered_at: string | null
  read_at: string | null
  sender_public_id: string
  sender_display_name: string
}
const {
  state,
  setAccessMode,
  setNeed,
} = useApp()
const request = computed(() => state.request)
const messagesElement = ref<HTMLElement | null>(null)

const selectedCounselor = computed(() =>
  displayedCounselors.value.find(
    (item) => item.id === route.params.id || item.publicId === route.params.id,
  ) || null,
)
const privacyChoice = ref(state.accessMode)
const counselorSearch = ref("")
const languageFilter = ref("All languages")
type CounselorCard = {
  id: string
  publicId: string
  name: string
  title: string
  bio: string
  areas: string[]
  specialtyIds: string[]
  language: string
  pictureUrl: string | null
}
type SupportCategory = { id: string; label: string }
const liveCounselors = ref<CounselorCard[]>([])
const supportCategories = ref<SupportCategory[]>([])
const counselorLoadError = ref("")
const counselorLoading = ref(false)
const displayedCounselors = computed<CounselorCard[]>(() => liveCounselors.value)
const selectedSupportCategory = computed(() =>
  supportCategories.value.find((category) => category.id === state.preferredCategoryId) || null,
)
const selectedCounselorSupportsCategory = computed(() =>
  Boolean(
    activeSupportCategoryId() &&
      selectedCounselor.value?.specialtyIds.includes(activeSupportCategoryId() || ""),
  ),
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
const registrationPicture = ref<File | null>(null)
const registrationPicturePreview = ref<string | null>(null)
const registrationPictureError = ref("")
const registrationConsent = ref(false)
const registrationAgeRange = ref("")
const registrationGender = ref("")
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
const profileBioDraft = ref("")
const profileAgeRange = ref("")
const profileGender = ref("")
const selectedProfilePicture = ref<File | null>(null)
const selectedProfilePicturePreview = ref<string | null>(null)
const profilePictureError = ref("")
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
const resourceDialogOpen = ref(false)
const resourceTitle = ref("")
const resourceUrl = ref("")
const resourceNote = ref("")
const resourceError = ref("")
const resourceDraftConversationPublicId = ref("")
const resourceDraftRecipient = ref("")
const journeyLoading = ref(false)
const journeySavingStage = ref<number | null>(null)
const journeyError = ref("")
const counselorCases = ref<Array<Record<string, string | null>>>([])
const realConversations = ref<LiveConversation[]>([])
const realMessages = ref<LiveMessage[]>([])
let messageLoadSequence = 0
let messagePollTimer: number | undefined
let conversationSummaryPollTimer: number | undefined
let messagePollInFlight = false
let conversationSummaryPollInFlight = false
let followLatestMessages = true
const messageSending = ref(false)
const editingMessageId = ref("")
const editDraft = ref("")
const messageActionError = ref("")
const realJourney = ref<Record<string, string>>({})
const journeyCompletedCount = computed(
  () => journeyStages.filter((stage) => realJourney.value[stage.name] === "completed").length,
)
const journeyProgressPercent = computed(() =>
  Math.round((journeyCompletedCount.value / journeyStages.length) * 100),
)
const currentConversation = ref<{
  publicId: string
  otherPartyPublicId: string
  otherPartyName: string | null
  otherPartyIsAnonymous: boolean
  otherPartyPictureUrl: string | null
  status: string
} | null>(null)
const conversationMessages = computed(() =>
  realMessages.value.map((message) => {
    const own = isOwnMessage(message.sender_public_id)
    return {
      id: message.id,
      record: message,
      own,
      sender: own ? "You" : message.sender_display_name,
      text: message.body,
      time: messageTime(message.created_at),
      edited: Boolean(message.edited_at),
      deleted: Boolean(message.deleted_at),
      status: own
        ? message.read_at
          ? "read"
          : message.delivered_at
            ? "delivered"
            : "sent"
        : null,
    }
  }),
)
const realAdminUsers = ref<Array<{
  publicId: string
  accountType: string
  role: string
  status: string
  anonymized: boolean
  displayName: string | null
  createdAt: string
  approved?: boolean
  areas?: string[]
  approvedCategoryIds?: string[]
  safeguardingReview?: boolean
}>>([])
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
const pendingUserAnonymization = ref<(typeof realAdminUsers.value)[number] | null>(null)
const anonymizationError = ref("")
const anonymizationLoading = ref(false)
const specialtyEditor = ref<(typeof realAdminUsers.value)[number] | null>(null)
const specialtyEditorIds = ref<string[]>([])
const specialtyEditorError = ref("")
const specialtyEditorSaving = ref(false)

const dashboardTitle = computed(() =>
  account.user?.displayName
    ? `Welcome, ${account.user.displayName}`
    : account.user?.accountType === "anonymous"
      ? "Your private space"
      : "Your ShepherdConnect home",
)
const currentJourneyStage = computed(() => {
  const stagesForUser = journeyStages.map((stage) => realJourney.value[stage.name])
  const next = stagesForUser.findIndex((status) => status !== "completed")
  return next >= 0 ? next : null
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

const adminTabs = ["Counselor Applications", "Counselors", "Users", "Safeguarding", "Settings"]
const adminTabDescriptions: Record<string, string> = {
  "Counselor Applications": "Review essential profile information and approve access; verify optional credentials separately when provided.",
  Users: "Manage account status without routine access to counseling content.",
  Safeguarding: "Restricted case triage requires a separate safeguarding permission.",
  Settings: "Manage public homepage artwork and permitted site configuration.",
}

function go(path: string) {
  void router.push(path)
}

function chooseSupportCategory(categoryId: string) {
  state.preferredCategoryId = categoryId
  state.browseAllCounselors = false
  if (route.name === "counselors") void loadCounselors()
}

function browseAllCounselors() {
  state.browseAllCounselors = true
  if (route.name === "counselors") void loadCounselors()
  else void router.push("/counselors")
}

function activeSupportCategoryId() {
  if (state.need === "Other") return state.preferredCategoryId
  return needs.find((item) => item.title === state.need)?.id || null
}

function counselorFlowUrl(path: string) {
  const query = new URLSearchParams({ need: state.need })
  const categoryId = activeSupportCategoryId()
  if (categoryId) query.set("categoryId", categoryId)
  if (state.browseAllCounselors) query.set("all", "true")
  return `${path}?${query.toString()}`
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
  counselorLoadError.value = ""
  counselorLoading.value = true
  try {
    if (!supportCategories.value.length) {
      const categoryResult = await api<{ categories: SupportCategory[] }>("/support-categories")
      supportCategories.value = categoryResult.categories
    }
    const categoryId = state.need === "Other"
      ? state.preferredCategoryId
      : needs.find((item) => item.title === state.need)?.id || null
    if (!categoryId && !state.browseAllCounselors) {
      liveCounselors.value = []
      return
    }
    const query = state.browseAllCounselors
      ? "?all=true"
      : `?categoryId=${encodeURIComponent(categoryId || "")}`
    const result = await api<{ counselors: Array<{
      publicId: string
      displayName: string | null
      headline: string
      bio: string
      areas: string[]
      specialtyIds: string[]
      languages: string[]
      pictureUrl: string | null
    }> }>(`/counselors/matches${query}`)
    liveCounselors.value = result.counselors.map((item) => {
      const name = item.displayName || item.publicId
      return {
        id: item.publicId,
        publicId: item.publicId,
        name,
        title: item.headline,
        bio: item.bio,
        areas: item.areas,
        specialtyIds: item.specialtyIds,
        language: item.languages.join(", "),
        pictureUrl: item.pictureUrl,
      }
    })
  } catch (error) {
    counselorLoadError.value =
      error instanceof Error ? error.message : "Matching counselor profiles could not be loaded."
  } finally {
    counselorLoading.value = false
  }
}

async function loadAdminUsers(role?: string) {
  const query = new URLSearchParams()
  if (role) query.set("role", role)
  const result = await api<{ users: typeof realAdminUsers.value }>(
    `/admin/users${query.size ? `?${query.toString()}` : ""}`,
  )
  realAdminUsers.value = result.users
}

function openSpecialtyEditor(user: (typeof realAdminUsers.value)[number]) {
  specialtyEditor.value = user
  specialtyEditorIds.value = [...(user.approvedCategoryIds || [])]
  specialtyEditorError.value = ""
}

async function saveCounselorSpecialties() {
  if (!specialtyEditor.value) return
  specialtyEditorSaving.value = true
  specialtyEditorError.value = ""
  try {
    const result = await api<{ approvedCategoryIds: string[] }>(
      `/admin/users/${encodeURIComponent(specialtyEditor.value.publicId)}/specialties`,
      {
        method: "PATCH",
        body: JSON.stringify({ categoryIds: specialtyEditorIds.value }),
      },
    )
    const target = realAdminUsers.value.find(
      (user) => user.publicId === specialtyEditor.value?.publicId,
    )
    if (target) target.approvedCategoryIds = result.approvedCategoryIds
    specialtyEditor.value = null
  } catch (error) {
    specialtyEditorError.value =
      error instanceof Error ? error.message : "Counselor categories could not be saved."
  } finally {
    specialtyEditorSaving.value = false
  }
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

async function loadAccountData() {
  const user = account.user
  if (!user) return

  if (user.accountType === "counselor" && user.role === "registered") {
    state.request = null
    currentConversation.value = null
    realConversations.value = []
    realMessages.value = []
    await loadCounselorApplication()
    return
  }

  if (user.role === "anonymous" || user.role === "registered") {
    const [requestResult, conversationResult, journeyResult] = await Promise.all([
      api<{ requests: Array<Record<string, string>> }>("/requests"),
      api<{ conversations: LiveConversation[] }>("/conversations"),
      api<{ progress: Array<{ stage: string; status: string }> }>("/journey"),
    ])
    const latest = requestResult.requests[0]
    state.request = latest
      ? {
          reference: latest.public_ref,
          counselor: latest.counselor_name || latest.counselor_public_id,
          topic: latest.topic,
          need: latest.support_category_label || latest.need,
          supportCategoryId: latest.support_category_id || null,
          description: latest.description,
          status: latest.status as RequestStatus,
          createdAt: latest.created_at,
        }
      : null
    realConversations.value = conversationResult.conversations
    const conversation =
      conversationResult.conversations.find(
        (item) => item.public_id === currentConversation.value?.publicId,
      ) || conversationResult.conversations[0]
    currentConversation.value = conversation
      ? {
          publicId: conversation.public_id,
          otherPartyPublicId: conversation.other_party_public_id,
          otherPartyName: conversation.other_party_display_name,
          otherPartyIsAnonymous: conversation.other_party_is_anonymous,
          otherPartyPictureUrl: conversation.other_party_picture_url,
          status: conversation.status,
        }
      : null
    if (!conversation) realMessages.value = []
    applyJourneyProgress(journeyResult.progress)
  } else if (user.role === "counselor") {
    const [caseResult, conversationResult, profileResult] = await Promise.all([
      api<{ cases: Array<Record<string, string | null>> }>("/counselor/cases"),
      api<{ conversations: LiveConversation[] }>("/conversations"),
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
    const conversation =
      conversationResult.conversations.find(
        (item) => item.public_id === currentConversation.value?.publicId,
      ) || conversationResult.conversations[0]
    currentConversation.value = conversation
      ? {
          publicId: conversation.public_id,
          otherPartyPublicId: conversation.other_party_public_id,
          otherPartyName: conversation.other_party_display_name,
          otherPartyIsAnonymous: conversation.other_party_is_anonymous,
          otherPartyPictureUrl: conversation.other_party_picture_url,
          status: conversation.status,
        }
      : null
    if (!conversation) realMessages.value = []
    const latest = caseResult.cases[0]
    state.request = latest
      ? {
          reference: String(latest.public_ref),
          counselor: String(latest.seeker_public_id),
          topic: String(latest.topic),
          need: String(latest.support_category_label || latest.need),
          supportCategoryId: String(latest.support_category_id || "") || null,
          description: String(latest.description || ""),
          status: String(latest.status) as RequestStatus,
          createdAt: String(latest.created_at),
        }
      : null
  } else {
    state.request = null
    currentConversation.value = null
    realMessages.value = []
  }

  if (route.name === "counseling" && currentConversation.value) {
    await loadMessages(currentConversation.value.publicId)
  }
  if (user.role === "superadmin" && route.name === "admin") {
    await loadAdminUsers(adminTab.value === "Counselors" ? "counselor" : undefined)
  }
}

async function changeRequestStatus(status: RequestStatus, publicRef?: string) {
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
}

async function updateAdminStatus(user: (typeof realAdminUsers.value)[number], status: string) {
  try {
    await api(`/admin/users/${encodeURIComponent(user.publicId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    })
    user.status = status
    account.error = ""
  } catch (error) {
    account.error = error instanceof Error ? error.message : "Account status could not be updated."
  }
}

function requestUserAnonymization(user: (typeof realAdminUsers.value)[number]) {
  pendingUserAnonymization.value = user
  anonymizationError.value = ""
}

async function confirmUserAnonymization() {
  const user = pendingUserAnonymization.value
  if (!user || anonymizationLoading.value) return
  anonymizationLoading.value = true
  anonymizationError.value = ""
  account.error = ""
  try {
    const result = await api<{ warning?: string }>(
      `/admin/users/${encodeURIComponent(user.publicId)}`,
      { method: "DELETE" },
    )
    user.status = "deactivated"
    user.anonymized = true
    user.displayName = null
    user.safeguardingReview = false
    if (result.warning) account.error = result.warning
    pendingUserAnonymization.value = null
  } catch (error) {
    anonymizationError.value =
      error instanceof Error ? error.message : "The account could not be anonymized."
  } finally {
    anonymizationLoading.value = false
  }
}

function cancelUserAnonymization() {
  if (!anonymizationLoading.value) {
    pendingUserAnonymization.value = null
    anonymizationError.value = ""
  }
}

async function updateAdminRole(user: (typeof realAdminUsers.value)[number], role: string) {
  try {
    await api(`/admin/users/${encodeURIComponent(user.publicId)}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    })
    user.role = role
    account.error = ""
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
      body: JSON.stringify({ displayName, bio: profileBioDraft.value }),
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

async function saveDemographics() {
  if (!account.user || account.user.accountType === "anonymous") return
  profileLoading.value = true
  profileStatus.value = ""
  try {
    await api("/me", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: displayNameDraft.value.trim() || null,
        ageRange: profileAgeRange.value || null,
        gender: profileGender.value || null,
      }),
    })
    profileStatus.value = "Private profile information updated."
  } catch (error) {
    profileStatus.value =
      error instanceof Error ? error.message : "Private profile information could not be saved."
  } finally {
    profileLoading.value = false
  }
}

async function loadUserProfile() {
  try {
    const result = await api<{ profile: {
      bio: string
      ageRange: string | null
      gender: string | null
      pictureUrl: string | null
    } }>("/me/profile")
    profileBioDraft.value = result.profile.bio
    profileAgeRange.value = result.profile.ageRange || ""
    profileGender.value = ["male", "female"].includes(result.profile.gender || "")
      ? result.profile.gender || ""
      : ""
    account.profilePictureUrl = result.profile.pictureUrl
  } catch (error) {
    profileStatus.value =
      error instanceof Error ? error.message : "Account profile could not be loaded."
  }
}

function selectRegistrationPicture(event: Event) {
  const input = event.currentTarget
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0] || null
  registrationPictureError.value = ""
  if (registrationPicturePreview.value) URL.revokeObjectURL(registrationPicturePreview.value)
  registrationPicturePreview.value = null
  registrationPicture.value = null
  if (!file) return
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    registrationPictureError.value = "Choose a JPEG, PNG, or WebP image."
    input.value = ""
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    registrationPictureError.value = "Profile pictures must be 5 MB or smaller."
    input.value = ""
    return
  }
  registrationPicture.value = file
  registrationPicturePreview.value = URL.createObjectURL(file)
}

function selectProfilePicture(event: Event) {
  const input = event.currentTarget
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0] || null
  profilePictureError.value = ""
  if (selectedProfilePicturePreview.value) URL.revokeObjectURL(selectedProfilePicturePreview.value)
  selectedProfilePicturePreview.value = null
  selectedProfilePicture.value = null
  if (!file) return
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    profilePictureError.value = "Choose a JPEG, PNG, or WebP image."
    input.value = ""
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    profilePictureError.value = "Profile pictures must be 5 MB or smaller."
    input.value = ""
    return
  }
  selectedProfilePicture.value = file
  selectedProfilePicturePreview.value = URL.createObjectURL(file)
}

async function saveProfilePicture() {
  if (!selectedProfilePicture.value) return
  profileLoading.value = true
  profilePictureError.value = ""
  profileStatus.value = ""
  try {
    const form = new FormData()
    form.set("picture", selectedProfilePicture.value)
    const result = await api<{ pictureUrl: string }>("/me/profile/picture", {
      method: "PUT",
      body: form,
    })
    account.profilePictureUrl = result.pictureUrl
    await loadCounselors()
    if (selectedProfilePicturePreview.value) URL.revokeObjectURL(selectedProfilePicturePreview.value)
    selectedProfilePicture.value = null
    selectedProfilePicturePreview.value = null
    profileStatus.value = "Profile picture updated."
  } catch (error) {
    profilePictureError.value =
      error instanceof Error ? error.message : "Profile picture could not be updated."
  } finally {
    profileLoading.value = false
  }
}

async function removeProfilePicture() {
  profileLoading.value = true
  profilePictureError.value = ""
  profileStatus.value = ""
  try {
    await api<void>("/me/profile/picture", { method: "DELETE" })
    account.profilePictureUrl = null
    await loadCounselors()
    if (selectedProfilePicturePreview.value) URL.revokeObjectURL(selectedProfilePicturePreview.value)
    selectedProfilePicture.value = null
    selectedProfilePicturePreview.value = null
    profileStatus.value = "Profile picture removed."
  } catch (error) {
    profilePictureError.value =
      error instanceof Error ? error.message : "Profile picture could not be removed."
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
  return realJourney.value[journeyStages[index].name] === "completed"
}

function applyJourneyProgress(progress: Array<{ stage: string; status: string }>) {
  const storedStatuses = new Map(progress.map((item) => [item.stage, item.status]))
  const statuses: Record<string, string> = {}
  let canAdvance = true
  for (const stage of journeyStages) {
    const storedStatus = storedStatuses.get(stage.name)
    if (!canAdvance || storedStatus !== "completed") {
      statuses[stage.name] =
        canAdvance && storedStatus === "in_progress" ? "in_progress" : "not_started"
      canAdvance = false
    } else {
      statuses[stage.name] = "completed"
    }
  }
  realJourney.value = statuses
}

async function loadJourneyProgress() {
  if (!account.user || !["anonymous", "registered"].includes(account.user.role)) return
  journeyLoading.value = true
  journeyError.value = ""
  try {
    const result = await api<{ progress: Array<{ stage: string; status: string }> }>("/journey")
    applyJourneyProgress(result.progress)
  } catch (error) {
    journeyError.value =
      error instanceof Error ? error.message : "Your journey progress could not be loaded."
  } finally {
    journeyLoading.value = false
  }
}

async function updateJourneyStage(
  index: number,
  status: "in_progress" | "completed" | "not_started" = "in_progress",
) {
  if (index !== currentJourneyStage.value) {
    journeyError.value = "Complete journey stages in order, starting with the next available stage."
    return
  }
  if (
    status === "completed" &&
    realJourney.value[journeyStages[index].name] !== "in_progress"
  ) {
    journeyError.value = "Start this stage before marking it complete."
    return
  }
  const stage = journeyStages[index].name
  journeySavingStage.value = index
  journeyError.value = ""
  try {
    const result = await api<{ progress: { stage: string; status: string } }>(
      `/journey/${encodeURIComponent(stage)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      },
    )
    realJourney.value[stage] = result.progress.status
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Journey progress could not be saved."
    if (message.includes("Complete the journey stages in order")) {
      await loadJourneyProgress()
    }
    journeyError.value = message
  } finally {
    journeySavingStage.value = null
  }
}

async function loadMessages(conversationPublicId: string) {
  const sequence = ++messageLoadSequence
  const result = await api<{ messages: LiveMessage[] }>(
    `/conversations/${encodeURIComponent(conversationPublicId)}/messages`,
  )
  if (
    sequence !== messageLoadSequence ||
    currentConversation.value?.publicId !== conversationPublicId
  ) return
  realMessages.value = result.messages
  if (route.name === "counseling" && document.visibilityState === "visible") {
    const incomingIds = result.messages
      .filter((message) => !isOwnMessage(message.sender_public_id) && !message.deleted_at)
      .map((message) => message.id)
    if (incomingIds.length) {
      await api(`/conversations/${encodeURIComponent(conversationPublicId)}/receipts`, {
        method: "POST",
        body: JSON.stringify({ messageIds: incomingIds, state: "read" }),
      })
    }
  }
}

async function loadConversationSummaries() {
  const result = await api<{ conversations: LiveConversation[] }>("/conversations")
  realConversations.value = result.conversations
  const current = result.conversations.find(
    (conversation) => conversation.public_id === currentConversation.value?.publicId,
  )
  if (current) {
    currentConversation.value = {
      publicId: current.public_id,
      otherPartyPublicId: current.other_party_public_id,
      otherPartyName: current.other_party_display_name,
      otherPartyIsAnonymous: current.other_party_is_anonymous,
      otherPartyPictureUrl: current.other_party_picture_url,
      status: current.status,
    }
  }
}

async function selectConversation(publicId: string) {
  const conversation = realConversations.value.find((item) => item.public_id === publicId)
  if (!conversation) return
  currentConversation.value = {
    publicId: conversation.public_id,
    otherPartyPublicId: conversation.other_party_public_id,
    otherPartyName: conversation.other_party_display_name,
    otherPartyIsAnonymous: conversation.other_party_is_anonymous,
    otherPartyPictureUrl: conversation.other_party_picture_url,
    status: conversation.status,
  }
  realMessages.value = []
  chatError.value = ""
  followLatestMessages = true
  editingMessageId.value = ""
  try {
    await loadMessages(conversation.public_id)
  } catch (error) {
    chatError.value = error instanceof Error ? error.message : "Conversation history could not be loaded."
  }
}

function beginMessageEdit(message: LiveMessage) {
  if (message.sender_public_id !== account.user?.publicId || message.deleted_at) return
  editingMessageId.value = message.id
  editDraft.value = message.body
  messageActionError.value = ""
}

function cancelMessageEdit() {
  editingMessageId.value = ""
  editDraft.value = ""
}

async function saveMessageEdit(message: LiveMessage) {
  const body = editDraft.value.trim()
  if (!body || body.length > 4000) {
    messageActionError.value = "Messages must contain 1–4000 characters."
    return
  }
  try {
    await api(`/messages/${encodeURIComponent(message.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    })
    cancelMessageEdit()
    messageActionError.value = ""
    if (currentConversation.value) await loadMessages(currentConversation.value.publicId)
  } catch (error) {
    messageActionError.value =
      error instanceof Error ? error.message : "The message could not be edited."
  }
}

async function deleteMessage(message: LiveMessage, scope: "for_me" | "for_everyone") {
  if (
    scope === "for_everyone" &&
    !window.confirm("Delete this message for everyone? Its text will be replaced with a deletion notice.")
  ) return
  try {
    await api(`/messages/${encodeURIComponent(message.id)}`, {
      method: "DELETE",
      body: JSON.stringify({ scope }),
    })
    if (editingMessageId.value === message.id) cancelMessageEdit()
    messageActionError.value = ""
    if (currentConversation.value) await loadMessages(currentConversation.value.publicId)
  } catch (error) {
    messageActionError.value =
      error instanceof Error ? error.message : "The message could not be deleted."
  }
}

function messageTime(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function isOwnMessage(senderPublicId: string) {
  return senderPublicId === account.user?.publicId
}

function trackMessageScroll(event: Event) {
  const element = event.currentTarget
  if (!(element instanceof HTMLElement)) return
  followLatestMessages =
    element.scrollHeight - element.scrollTop - element.clientHeight < 48
}

onMounted(async () => {
  localStorage.removeItem("sc-demo")
  localStorage.removeItem("sc-request")
  messagePollTimer = window.setInterval(async () => {
    if (
      messagePollInFlight ||
      route.name !== "counseling" ||
      document.visibilityState !== "visible" ||
      !currentConversation.value
    ) return
    messagePollInFlight = true
    try {
      await loadConversationSummaries()
      await loadMessages(currentConversation.value.publicId)
    } catch (error) {
      chatError.value =
        error instanceof Error ? error.message : "Conversation updates could not be loaded."
    } finally {
      messagePollInFlight = false
    }
  }, 5000)
  conversationSummaryPollTimer = window.setInterval(async () => {
    if (
      conversationSummaryPollInFlight ||
      route.name !== "counselor" ||
      document.visibilityState !== "visible" ||
      !account.user
    ) return
    conversationSummaryPollInFlight = true
    try {
      await loadConversationSummaries()
    } catch (error) {
      account.error = error instanceof Error
        ? error.message
        : "Conversation profile details could not be refreshed."
    } finally {
      conversationSummaryPollInFlight = false
    }
  }, 15000)
  void loadHomepageSettings().catch((error) => {
    homepageSettingsError.value =
      error instanceof Error ? error.message : "Homepage settings could not be loaded."
  })
  const queryNeed = typeof route.query.need === "string" ? route.query.need : null
  if (queryNeed && needs.some((item) => item.title === queryNeed)) {
    state.need = queryNeed
  }
  const queryCategoryId =
    typeof route.query.categoryId === "string" ? route.query.categoryId : null
  if (queryCategoryId) state.preferredCategoryId = queryCategoryId
  state.browseAllCounselors = route.query.all === "true"
  void loadCounselors()
  try {
    await refreshAccount()
    if (account.user) {
      await Promise.all([
        loadAccountData(),
        loadUserProfile(),
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
    if (name === "account-settings") {
      await loadUserProfile()
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
    if (name === "counseling") {
      try {
        await loadAccountData()
      } catch (error) {
        chatError.value = error instanceof Error ? error.message : "Conversation could not be loaded."
      }
    }
    if (name === "journey" || name === "seeker-dashboard") {
      await loadJourneyProgress()
    }
  },
)

onBeforeUnmount(() => {
  if (messagePollTimer !== undefined) window.clearInterval(messagePollTimer)
  if (conversationSummaryPollTimer !== undefined) window.clearInterval(conversationSummaryPollTimer)
  if (homepageImagePreview.value) URL.revokeObjectURL(homepageImagePreview.value)
})

watch(
  realMessages,
  async () => {
    await nextTick()
    const element = messagesElement.value
    if (element && followLatestMessages) element.scrollTop = element.scrollHeight
  },
  { flush: "post" },
)

watch(
  () => account.user?.publicId,
  () => {
    messageLoadSequence += 1
    realMessages.value = []
    currentConversation.value = null
    chatError.value = ""
  },
)

watch(adminTab, (tab) => {
  if (route.name === "admin" && account.user?.role === "superadmin") {
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
  if (registrationPicturePreview.value) URL.revokeObjectURL(registrationPicturePreview.value)
  registrationPicture.value = null
  registrationPicturePreview.value = null
  registrationPictureError.value = ""
  accountName.value = ""
  email.value = ""
  password.value = ""
  publicId.value = ""
  registrationConsent.value = false
  registrationAgeRange.value = ""
  registrationGender.value = ""
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
    if (!account.user) {
      accountType.value = state.accessMode === "private" ? "anonymous" : "registered"
      authMode.value = "create"
      authReturnToFlow.value = true
      requestError.value = "Create your private account to securely send and track this request."
      go("/sign-in")
      return
    }
    const counselor = selectedCounselor.value
    if (!counselor?.publicId) {
      throw new Error("Choose an approved counselor with an active ShepherdConnect account.")
    }
    const supportCategoryId = activeSupportCategoryId()
    if (!supportCategoryId) {
      throw new Error("Choose a support category before sending your counseling request.")
    }
    if (!counselor.specialtyIds.includes(supportCategoryId)) {
      throw new Error("This counselor is not approved for the selected support category.")
    }
    const result = await api<{ request: {
      public_ref: string
      status: RequestStatus
      created_at: string
    } }>("/requests", {
      method: "POST",
      body: JSON.stringify({
        counselorPublicId: counselor.publicId,
        need: state.need,
        supportCategoryId,
        topic: topic.value.trim(),
        description: description.value.trim(),
      }),
    })
    state.request = {
      reference: result.request.public_ref,
      counselor: counselor.name,
      topic: topic.value.trim(),
      need: state.need,
      supportCategoryId,
      description: description.value.trim(),
      status: result.request.status,
      createdAt: result.request.created_at,
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
      const registrationDetails = {
        email: email.value,
        password: password.value,
        displayName: accountName.value,
        ageRange: registrationAgeRange.value || null,
        gender: registrationGender.value || null,
        consent: registrationConsent.value,
      }
      let body: BodyInit = JSON.stringify(registrationDetails)
      const selectedPicture = registrationPicture.value
      if (selectedPicture) {
        const form = new FormData()
        form.set("profile", JSON.stringify(registrationDetails))
        form.set("profilePicture", selectedPicture)
        body = form
      }
      result = await api<AuthResponse>("/auth/register", {
        method: "POST",
        body,
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
      await Promise.all([loadCounselors(), loadAccountData(), loadUserProfile()])
      go(homeFor(result.user))
    }
    if (authMode.value !== "sign-in") {
      setAccountUser(result.user)
      recoveryCode.value = result.recoveryCode || ""
      recoveryCopied.value = false
      await refreshAccount()
      await loadUserProfile()
      if (registrationPicture.value) {
        account.profilePictureUrl = `/me/profile/picture?v=${Date.now()}`
      }
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
    await refreshAccount()
    await loadUserProfile()
    if (!existingAccount && payload.has("profilePicture")) {
      account.profilePictureUrl = `/me/profile/picture?v=${Date.now()}`
    }
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
  if (!account.user || !currentConversation.value || currentConversation.value.status !== "open") {
    chatError.value = "There is no open assigned conversation to message."
    return
  }
  const conversationPublicId = currentConversation.value.publicId
  if (
    resourceDraftConversationPublicId.value &&
    resourceDraftConversationPublicId.value !== conversationPublicId
  ) {
    chatError.value =
      "This resource was prepared for a different conversation. Select that conversation or discard and prepare the resource again."
    return
  }
  messageSending.value = true
  try {
    await api(`/conversations/${encodeURIComponent(conversationPublicId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: text }),
    })
    chatText.value = ""
    resourceDraftConversationPublicId.value = ""
    resourceDraftRecipient.value = ""
    chatError.value = ""
  } catch (error) {
    chatError.value = error instanceof Error ? error.message : "Message could not be sent."
    return
  } finally {
    messageSending.value = false
  }
  try {
    await loadMessages(conversationPublicId)
  } catch (error) {
    chatError.value =
      error instanceof Error
        ? `Your message was sent, but history could not be refreshed: ${error.message}`
        : "Your message was sent, but history could not be refreshed."
  }
}

function messageSegments(body: string) {
  return body.split(/(https:\/\/\S+)/g).map((text) => {
    try {
      const url = new URL(text)
      return url.protocol === "https:"
        ? { text, href: text }
        : { text, href: null }
    } catch {
      return { text, href: null }
    }
  })
}

function openResourceDialog() {
  if (account.user?.role !== "counselor") {
    chatError.value = "Only the assigned counselor can prepare a resource for this conversation."
    return
  }
  if (!currentConversation.value || currentConversation.value.status !== "open") {
    chatError.value = "Select an open assigned conversation before adding a resource."
    return
  }
  resourceTitle.value = ""
  resourceUrl.value = ""
  resourceNote.value = ""
  resourceError.value = ""
  resourceDialogOpen.value = true
}

function prepareResourceForSend() {
  const conversation = currentConversation.value
  const title = resourceTitle.value.trim()
  const urlText = resourceUrl.value.trim()
  const note = resourceNote.value.trim()
  if (account.user?.role !== "counselor" || !conversation || conversation.status !== "open") {
    resourceError.value = "Select an open assigned conversation before adding a resource."
    return
  }
  if (!title || title.length > 160) {
    resourceError.value = "Enter a resource title of 1–160 characters."
    return
  }
  let url: URL
  try {
    url = new URL(urlText)
  } catch {
    resourceError.value = "Enter a valid HTTPS resource link."
    return
  }
  if (url.protocol !== "https:" || url.username || url.password || urlText.length > 2048) {
    resourceError.value = "Use a valid HTTPS resource link without embedded sign-in details."
    return
  }
  if (chatText.value.trim()) {
    resourceError.value = "Send or clear the current message before preparing a resource."
    return
  }

  const draft = [`A resource for you:`, title, url.href, note].filter(Boolean).join("\n\n")
  if (draft.length > 4000) {
    resourceError.value = "Shorten the resource note so it fits in a message."
    return
  }
  chatText.value = draft
  resourceDraftConversationPublicId.value = conversation.publicId
  resourceDraftRecipient.value =
    conversation.otherPartyName || conversation.otherPartyPublicId
  resourceDialogOpen.value = false
  resourceError.value = ""
  chatError.value = ""
}

function discardResourceDraft() {
  if (resourceDraftConversationPublicId.value) chatText.value = ""
  resourceDraftConversationPublicId.value = ""
  resourceDraftRecipient.value = ""
  chatError.value = ""
}

function updateJourneyPrimaryStage() {
  const index = currentJourneyStage.value ?? 0
  const stage = journeyStages[index].name
  const status = realJourney.value[stage] === "in_progress" ? "completed" : "in_progress"
  void updateJourneyStage(index, status)
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
    if (!account.user) {
      reportStatus.value = "Sign in to submit a safeguarding concern."
      return
    }
    await api("/concerns", {
      method: "POST",
      body: JSON.stringify({ summary }),
    })
    reportStatus.value = "Your concern was submitted for safeguarding review."
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
        <button v-for="(item, index) in needs" :key="item.title" :class="state.need === item.title ? 'need-card selected' : 'need-card'" @click="setNeed(item.title, item.id === 'other' ? null : item.id)">
          <span><Icon :name="['Sparkles','Heart','BookOpen','GraduationCap','Sprout','MoreHorizontal'][index]" :size="22" /></span><div><strong>{{ item.title }}</strong><small>{{ item.note }}</small></div><i><Icon v-if="state.need === item.title" name="Check" :size="14" /></i>
        </button>
      </div>
      <div v-if="state.need === 'Other'" class="other-category-picker">
        <Field label="Choose a preferred counselor category">
          <select
            class="control"
            :value="state.preferredCategoryId || ''"
            @change="chooseSupportCategory(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Explore available categories</option>
            <option v-for="category in supportCategories" :key="category.id" :value="category.id">
              {{ category.label }}
            </option>
          </select>
        </Field>
        <p v-if="!supportCategories.length" class="field-hint">Available categories are loading.</p>
        <BaseButton variant="secondary" @click="browseAllCounselors">
          View all available counselors
        </BaseButton>
      </div>
      <div class="flow-actions"><BaseButton variant="secondary" @click="go('/privacy')">Back</BaseButton><BaseButton @click="go('/counselors')">Find a counselor <Icon name="ArrowRight" /></BaseButton></div>
    </div>
  </main>

  <main v-else-if="route.name === 'counselors'" class="flow-page">
    <div class="flow-top"><Brand /><span>Step 3 of 3</span></div>
    <div class="directory-shell">
      <button class="back-link" @click="go('/needs')"><Icon name="ArrowLeft" :size="17" /> Back</button>
      <div class="directory-heading"><div><h1>Find a counselor</h1><p>Every counselor shown here is approved by GCML.</p></div><Badge tone="success"><Icon name="ShieldCheck" :size="14" /> Verified profiles</Badge></div>
      <div v-if="state.need === 'Other'" class="other-category-picker">
        <Field label="Preferred category">
          <select
            class="control"
            :value="state.preferredCategoryId || ''"
            @change="chooseSupportCategory(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Choose a category</option>
            <option v-for="category in supportCategories" :key="category.id" :value="category.id">
              {{ category.label }}
            </option>
          </select>
        </Field>
        <BaseButton variant="secondary" @click="browseAllCounselors">View all available counselors</BaseButton>
      </div>
      <p v-if="state.browseAllCounselors" class="field-hint">Browsing all active, approved counselors.</p>
      <p v-else-if="selectedSupportCategory" class="field-hint">Matched for {{ selectedSupportCategory.label }}.</p>
      <div class="filters">
        <label class="search-control"><Icon name="Search" :size="18" /><input v-model="counselorSearch" placeholder="Search counselors or service areas" /></label>
        <select v-model="languageFilter" class="control"><option>All languages</option><option v-for="language in languageOptions" :key="language">{{ language }}</option></select>
      </div>
      <p class="results-label">{{ filteredCounselors.length }} counselors available for <strong>{{ state.need === 'Other' ? selectedSupportCategory?.label || 'your selected category' : state.need }}</strong></p>
      <div class="counselor-grid">
        <article v-for="counselor in filteredCounselors" :key="counselor.id" class="counselor-card">
          <div class="counselor-card-top"><ProfileAvatar :src="counselor.pictureUrl ? apiUrl(counselor.pictureUrl) : null" :name="counselor.name" size="medium" /><Badge tone="success"><span class="status-dot" /> GCML approved</Badge></div>
          <h2>{{ counselor.name }}</h2><p class="counselor-title">{{ counselor.title }}</p><p>{{ counselor.bio }}</p>
          <div class="tag-row"><Badge v-for="area in counselor.areas.slice(0,3)" :key="area">{{ area }}</Badge></div>
          <div class="counselor-meta"><span><Icon name="Languages" :size="16" /> {{ counselor.language || "Languages not listed" }}</span></div>
          <RouterLink class="card-link" :to="counselorFlowUrl(`/counselors/${counselor.id}`)">View profile <Icon name="ArrowRight" :size="16" /></RouterLink>
        </article>
      </div>
      <div v-if="counselorLoading" class="empty-state" role="status"><p>Finding eligible counselors…</p></div>
      <Notice v-if="counselorLoadError" title="Counselor directory unavailable" tone="warning">{{ counselorLoadError }}</Notice>
      <div v-else-if="!counselorLoading && !filteredCounselors.length" class="empty-state"><span><Icon name="MessageCircle" :size="26" /></span><h3>{{ liveCounselors.length ? 'No counselor matches those filters' : state.need === 'Other' && !state.preferredCategoryId && !state.browseAllCounselors ? 'Choose a category to find a counselor' : 'No counselors are currently available in this category' }}</h3><p>{{ liveCounselors.length ? 'Try another language or a broader search.' : state.need === 'Other' && !state.preferredCategoryId && !state.browseAllCounselors ? 'Select a preferred category or choose to view all available counselors.' : 'Please choose another category or try again later.' }}</p></div>
    </div>
  </main>

  <main v-else-if="route.name === 'counselor-profile' && selectedCounselor" class="flow-page">
    <div class="flow-top"><Brand /></div>
    <div class="profile-shell">
      <button class="back-link" @click="go(counselorFlowUrl('/counselors'))"><Icon name="ArrowLeft" :size="17" /> All counselors</button>
      <div class="profile-layout">
        <aside class="profile-summary">
          <ProfileAvatar :src="selectedCounselor.pictureUrl ? apiUrl(selectedCounselor.pictureUrl) : null" :name="selectedCounselor.name" size="large" /><h1>{{ selectedCounselor.name }}</h1><p>{{ selectedCounselor.title }}</p><Badge tone="success"><Icon name="ShieldCheck" :size="14" /> GCML approved</Badge>
          <div class="profile-facts"><span><Icon name="Languages" :size="17" /><b>Languages</b><small>{{ selectedCounselor.language || "Not listed" }}</small></span></div>
          <BaseButton @click="go(counselorFlowUrl(`/request/${selectedCounselor.id}`))">Request counseling <Icon name="ArrowRight" /></BaseButton><small class="no-guarantee">Availability and response times are not guaranteed.</small>
        </aside>
        <main class="profile-body">
          <section><span class="section-kicker">About</span><h2>About {{ selectedCounselor.name }}</h2><p>{{ selectedCounselor.bio || "This counselor has not added an introduction yet." }}</p></section>
          <section><h3>Areas of service</h3><div class="service-list"><span v-for="area in [...selectedCounselor.areas, 'Discipleship follow-up']" :key="area"><Icon name="CheckCircle2" :size="18" /> {{ area }}</span></div></section>
          <section class="boundary-card"><Icon name="Shield" :size="22" /><div><h3>Healthy counseling boundaries</h3><p>Counselors do not provide emergency or clinical care. Conversations follow GCML safeguarding and privacy policies, and you can report a concern at any time.</p></div></section>
        </main>
      </div>
    </div>
  </main>

  <main v-else-if="route.name === 'request' && selectedCounselor" class="flow-page">
    <div class="flow-top"><Brand /></div>
    <div class="request-shell">
      <button class="back-link" @click="go(counselorFlowUrl(`/counselors/${selectedCounselor.id}`))"><Icon name="ArrowLeft" :size="17" /> Back</button>
      <div class="request-layout">
        <div class="request-copy">
          <Badge tone="blue"><Icon name="LockKeyhole" :size="14" /> Private request</Badge><h1>Start a conversation with {{ selectedCounselor.name }}</h1><p>Share only what feels necessary. Your counselor will see this after the request is assigned to them.</p>
          <div class="mini-counselor"><ProfileAvatar :src="selectedCounselor.pictureUrl ? apiUrl(selectedCounselor.pictureUrl) : null" :name="selectedCounselor.name" size="medium" /><div><strong>{{ selectedCounselor.name }}</strong><small>{{ selectedCounselor.title }}</small><small>Support category: {{ selectedSupportCategory?.label || state.need }}</small></div></div>
          <Notice :title="state.accessMode === 'private' ? 'You’re using Private mode' : 'You’re using profile mode'">{{ state.accessMode === 'private' ? 'Your counselor will see a generated alias, not your real name.' : 'Your chosen display name may be shown to your counselor.' }}</Notice>
          <Notice v-if="activeSupportCategoryId() && !selectedCounselorSupportsCategory" title="Choose a matching counselor" tone="warning">
            This counselor is not approved for the selected category. Return to the directory and choose an eligible counselor.
          </Notice>
          <Field v-if="!activeSupportCategoryId() && selectedCounselor.specialtyIds.length" label="Choose a support category for this request">
            <select
              class="control"
              required
              :value="state.preferredCategoryId || ''"
              @change="chooseSupportCategory(($event.target as HTMLSelectElement).value)"
            >
              <option value="">Select a category</option>
              <option
                v-for="category in supportCategories.filter((item) => selectedCounselor?.specialtyIds.includes(item.id))"
                :key="category.id"
                :value="category.id"
              >
                {{ category.label }}
              </option>
            </select>
          </Field>
          <Notice v-else-if="!activeSupportCategoryId()" title="Counselor categories unavailable" tone="warning">
            This counselor has no approved support categories available for a request. Please choose another counselor or try again later.
          </Notice>
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
      <section class="auth-message"><Badge tone="success"><Icon name="ShieldCheck" :size="14" /> Secure account access</Badge><h1>Your journey can continue here.</h1><p>Return to conversations, saved guidance, and your discipleship path from one private place.</p><div class="auth-quote"><blockquote>“I am the good shepherd. I know my own and my own know me.”</blockquote><cite>John 10:14</cite></div></section>
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
          :support-categories="supportCategories"
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
            <template v-if="authMode === 'create' && accountType === 'registered'">
              <Field label="Age range — optional" hint="This private information is not shown on your public profile.">
                <select v-model="registrationAgeRange" class="control">
                  <option value="">Prefer not to provide</option>
                  <option value="under_18">Under 18</option>
                  <option value="18_24">18–24</option>
                  <option value="25_34">25–34</option>
                  <option value="35_44">35–44</option>
                  <option value="45_54">45–54</option>
                  <option value="55_plus">55 and above</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </Field>
              <Field label="Gender — optional" hint="This private information is not shared with counselors or other users.">
                <select v-model="registrationGender" class="control">
                  <option value="" disabled>Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </Field>
            </template>
            <Field v-if="authMode === 'create' && accountType === 'registered'" label="Profile picture — optional" hint="JPEG, PNG, or WebP; up to 5 MB. You can change or remove it later.">
              <div class="profile-picture-field">
                <ProfileAvatar
                  v-if="registrationPicturePreview"
                  class="profile-picture-preview"
                  :src="registrationPicturePreview"
                  :name="accountName || 'Your profile'"
                  size="medium"
                />
                <span v-else class="profile-picture-preview profile-picture-placeholder"><Icon name="UserRound" :size="24" /></span>
                <input class="control file-control" type="file" accept="image/jpeg,image/png,image/webp" @change="selectRegistrationPicture" />
              </div>
            </Field>
            <p v-if="registrationPictureError" class="form-error" role="alert">{{ registrationPictureError }}</p>
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
    <Notice v-if="account.user && !['anonymous', 'registered'].includes(account.user.role)" title="This page is not available">Your role does not have access to a seeker dashboard.</Notice>
    <div v-else class="dashboard-grid">
      <section class="welcome-panel"><div><Badge tone="success">You’re not alone</Badge><h2>How are you doing today?</h2><p>Your next step can be small. Continue a conversation, revisit guidance, or simply pause for prayer.</p><p v-if="account.user" class="dashboard-public-id">Your account ID <strong>{{ account.user.publicId }}</strong></p><div><BaseButton @click="go('/counseling')">Open counseling room <Icon name="ArrowRight" :size="17" /></BaseButton><BaseButton variant="ghost" @click="go('/guidance')">View resources</BaseButton></div></div><span class="welcome-art"><Icon name="Leaf" :size="72" /></span></section>
      <section class="status-card">
        <div class="card-heading"><div><span class="section-kicker">Counseling request</span><h2>Your connection</h2></div><Badge v-if="request" :tone="request.status === 'Pending' ? 'warning' : 'success'">{{ request.status }}</Badge></div>
        <template v-if="request">
          <div class="connection-row"><span class="private-avatar"><Icon name="EyeOff" :size="20" /></span><div><strong>{{ request.counselor }}</strong><small>{{ request.topic }}</small></div></div>
          <div class="status-timeline"><span class="done"><Icon name="Check" :size="13" /></span><i /><span :class="request.status === 'Accepted' ? 'done' : 'current'"><Icon :name="request.status === 'Accepted' ? 'Check' : 'Clock3'" :size="13" /></span><i /><span><Icon name="MessageCircle" :size="13" /></span></div>
          <div class="timeline-labels"><span>Sent</span><span>{{ request.status === 'Accepted' ? 'Accepted' : 'Awaiting reply' }}</span><span>Conversation</span></div>
          <div class="card-actions"><BaseButton v-if="request.status === 'Pending'" variant="secondary" @click="changeRequestStatus('Cancelled')">Cancel request</BaseButton><BaseButton v-else @click="go('/counseling')">Open room</BaseButton><small>Reference {{ request.reference }}</small></div>
        </template>
        <div v-else class="empty-state"><span><Icon name="MessageCircle" :size="26" /></span><h3>No active request</h3><p>Choose an approved counselor when you’re ready.</p><BaseButton @click="go('/needs')">Find support</BaseButton></div>
      </section>
      <section class="journey-preview"><div class="card-heading"><div><span class="section-kicker">Counsel → Guide → Disciple</span><h2>Your journey</h2></div><RouterLink to="/journey">My journey</RouterLink></div><div class="journey-line"><div v-for="(stage, index) in journeyStages" :key="stage.name" :class="journeyStageCompleted(index) ? 'complete' : index === currentJourneyStage ? 'active' : ''"><span><Icon v-if="journeyStageCompleted(index)" name="Check" :size="13" /><template v-else>{{ index + 1 }}</template></span><small>{{ stage.name }}</small></div></div><p v-if="currentJourneyStage === null && journeyCompletedCount === 0">Your journey has not started. Explore the stages when you are ready.</p><p v-else-if="currentJourneyStage === null"><strong>Journey complete:</strong> all {{ journeyStages.length }} stages completed.</p><p v-else><strong>Next stage:</strong> {{ journeyStages[currentJourneyStage].name }} · {{ journeyProgressPercent }}% complete</p></section>
      <section class="quick-links"><h2>Quick actions</h2><button @click="go('/journey')"><span><Icon name="Sprout" :size="20" /></span><div><strong>My discipleship journey</strong><small>Continue or update your growth steps</small></div><Icon name="ChevronRight" /></button><button @click="go('/guidance')"><span><Icon name="BookOpen" :size="20" /></span><div><strong>Browse resources</strong><small>Approved guidance when available</small></div><Icon name="ChevronRight" /></button><button @click="go('/needs')"><span><Icon name="HeartHandshake" :size="20" /></span><div><strong>Find another counselor</strong><small>Browse approved profiles</small></div><Icon name="ChevronRight" /></button><button @click="go('/counseling')"><span><Icon name="Flag" :size="20" /></span><div><strong>Report a concern</strong><small>Contact safeguarding support</small></div><Icon name="ChevronRight" /></button></section>
    </div>
  </AppShell>

  <AppShell v-else-if="route.name === 'counselor-dashboard'" title="Counselor dashboard" eyebrow="Your workspace">
    <Notice v-if="account.user && account.user.role !== 'counselor'" title="This page is not available">Only an assigned counselor account can access the counselor workspace.</Notice>
    <template v-else>
    <div class="stats-row">
      <div><span><Icon name="HeartHandshake" :size="20" /></span><small>New requests</small><strong>{{ counselorCases.filter((item) => item.status === 'Pending').length }}</strong></div><div><span><Icon name="MessageCircle" :size="20" /></span><small>Active conversations</small><strong>{{ realConversations.filter((item) => item.status === 'open').length }}</strong></div>
    </div>
    <div class="dashboard-two-col">
      <section class="panel"><div class="card-heading"><div><span class="section-kicker">Needs your attention</span><h2>New requests</h2></div><Badge tone="warning">{{ counselorCases.some((item) => item.status === 'Pending') ? 'New requests' : 'Up to date' }}</Badge></div>
        <template>
          <article v-for="caseItem in counselorCases.filter((item) => item.status === 'Pending')" :key="String(caseItem.public_ref)" class="request-row"><span class="private-avatar"><Icon name="EyeOff" :size="20" /></span><div class="request-main"><div><strong>{{ caseItem.seeker_public_id }}</strong><Badge>Assigned case</Badge></div><h3>{{ caseItem.topic }}</h3><p>{{ caseItem.description || 'The seeker requested a private conversation.' }}</p><span><Icon name="Clock3" :size="14" /> {{ caseItem.need }}</span></div><div class="request-actions"><BaseButton @click="changeRequestStatus('Accepted', String(caseItem.public_ref))">Accept</BaseButton><BaseButton variant="secondary" @click="changeRequestStatus('Declined', String(caseItem.public_ref))">Decline</BaseButton></div></article>
          <div v-if="!counselorCases.some((item) => item.status === 'Pending')" class="empty-state"><span><Icon name="MessageCircle" :size="26" /></span><h3>No new requests</h3><p>New assigned requests will appear here.</p></div>
        </template>
      </section>
      <section class="panel"><div class="card-heading"><div><span class="section-kicker">Continue care</span><h2>Active conversations</h2></div><div><RouterLink to="/counselor/disciples">View disciples</RouterLink> · <RouterLink to="/counseling">View all</RouterLink></div></div>
        <button v-for="conversation in realConversations" :key="conversation.public_id" class="conversation-row" @click="selectConversation(conversation.public_id); go('/counseling')"><span v-if="conversation.other_party_is_anonymous" class="private-avatar"><Icon name="EyeOff" :size="17" /></span><ProfileAvatar v-else :src="conversation.other_party_picture_url ? apiUrl(conversation.other_party_picture_url) : null" :name="conversation.other_party_display_name || conversation.other_party_public_id" size="small" /><div><strong>{{ conversation.other_party_display_name || conversation.other_party_public_id }}</strong><small>Assigned private conversation</small></div><span>{{ conversation.status }}</span></button><p v-if="!realConversations.length" class="empty-state">No assigned conversations.</p>
      </section>
    </div>
    </template>
  </AppShell>

  <AppShell v-else-if="route.name === 'counselor-disciples'" title="Disciples" eyebrow="People you have counseled">
    <Notice v-if="account.user && account.user.role !== 'counselor'" title="This page is not available">Only assigned counselors can view their counseling relationships.</Notice>
    <CounselorDisciples v-else />
  </AppShell>

  <AppShell v-else-if="route.name === 'counseling'" :title="`Private counseling${currentConversation ? ` · ${currentConversation.otherPartyName || currentConversation.otherPartyPublicId}` : ''}`" eyebrow="Your conversations">
    <template #action><BaseButton variant="danger" @click="leaveConversation"><Icon name="ArrowRight" :size="17" /> Quick Exit</BaseButton></template>
    <div class="room-layout">
      <section class="chat-panel">
        <header class="chat-person"><span v-if="!currentConversation || currentConversation.otherPartyIsAnonymous" class="private-avatar"><Icon name="EyeOff" :size="18" /></span><ProfileAvatar v-else :src="currentConversation.otherPartyPictureUrl ? apiUrl(currentConversation.otherPartyPictureUrl) : null" :name="currentConversation.otherPartyName || currentConversation.otherPartyPublicId" size="medium" /><div><strong>{{ currentConversation?.otherPartyName || currentConversation?.otherPartyPublicId || "No assigned conversation" }}</strong><small><span class="status-dot" /> {{ currentConversation?.status === 'open' ? 'Assigned private conversation' : currentConversation ? 'Conversation history · resolved' : 'No open conversation' }}</small></div><button @click="reportOpen = true"><Icon name="Flag" :size="17" /> Report a concern</button></header>
        <Notice title="Private conversation">Only you and your assigned counselor can access this room. Avoid unnecessary identifying information.</Notice>
        <label v-if="account.user && realConversations.length > 1" class="conversation-picker">
          <span>Conversation history</span>
          <select
            class="control"
            :value="currentConversation?.publicId"
            aria-label="Choose a conversation"
            @change="selectConversation(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="conversation in realConversations" :key="conversation.public_id" :value="conversation.public_id">
              {{ conversation.other_party_display_name }} · {{ conversation.status }}
            </option>
          </select>
        </label>
        <div v-if="!currentConversation" ref="messagesElement" class="messages"><div class="empty-state"><span><Icon name="MessageCircle" :size="26" /></span><h3>No assigned conversation</h3><p>When an assigned counselor accepts a request, the conversation will appear here.</p></div></div>
        <div v-else ref="messagesElement" class="messages" aria-label="Conversation messages" @scroll="trackMessageScroll">
          <div
            v-for="message in conversationMessages"
            :key="message.id"
            :class="['message', message.own ? 'message-outgoing' : 'message-incoming']"
          >
            <small>{{ message.sender }}</small>
            <form v-if="editingMessageId === message.id" class="message-edit-form" @submit.prevent="saveMessageEdit(message.record)">
              <textarea v-model="editDraft" class="control textarea" rows="3" maxlength="4000" aria-label="Edit message" />
              <div><BaseButton type="submit">Save</BaseButton><BaseButton type="button" variant="secondary" @click="cancelMessageEdit">Cancel</BaseButton></div>
            </form>
            <p v-else class="message-body"><template v-for="(segment, index) in messageSegments(message.text)" :key="index"><a v-if="segment.href" :href="segment.href" target="_blank" rel="noopener noreferrer">{{ segment.text }}</a><template v-else>{{ segment.text }}</template></template></p>
            <span>
              {{ message.time }}
              <template v-if="message.edited"> · Edited</template>
              <template v-if="message.own">
                · <span
                  class="message-receipt"
                  :class="{ 'message-receipt-read': message.status === 'read' }"
                  :aria-label="message.status === 'read' ? 'Read' : message.status === 'delivered' ? 'Delivered' : 'Sent'"
                  :title="message.status === 'read' ? 'Read' : message.status === 'delivered' ? 'Delivered to recipient account' : 'Sent'"
                >{{ message.status === 'sent' ? "✓" : "✓✓" }}</span>
              </template>
            </span>
            <details class="message-actions">
              <summary aria-label="Message actions" title="Message actions">⋯</summary>
              <div>
                <button v-if="message.own && !message.deleted" type="button" @click="beginMessageEdit(message.record)">Edit</button>
                <button type="button" @click="deleteMessage(message.record, 'for_me')">Delete for me</button>
                <button v-if="message.own && !message.deleted" type="button" @click="deleteMessage(message.record, 'for_everyone')">Delete for everyone</button>
              </div>
            </details>
          </div>
        </div>
        <p v-if="chatError" class="form-error" role="alert">{{ chatError }}</p>
        <p v-if="messageActionError" class="form-error" role="alert">{{ messageActionError }}</p>
        <div class="share-tools"><button @click="go('/guidance')"><Icon name="BookOpen" :size="17" /> Scripture</button><button @click="chatText = 'Could we pause and pray about this together?'"><Icon name="Heart" :size="17" /> Prayer</button><button v-if="account.user?.role === 'counselor'" :disabled="!currentConversation || currentConversation.status !== 'open'" @click="openResourceDialog"><Icon name="Plus" :size="17" /> Add resource</button><button v-else @click="go('/guidance')"><Icon name="Plus" :size="17" /> Resources</button></div>
        <p v-if="resourceDraftConversationPublicId" class="resource-draft-status" role="status">Resource draft for {{ resourceDraftRecipient }}. Review it below before sending.<button type="button" @click="discardResourceDraft">Discard draft</button></p>
        <p v-if="resourceDraftConversationPublicId && currentConversation?.publicId !== resourceDraftConversationPublicId" class="form-error" role="alert">This draft is for a different conversation. Select the intended person or discard the draft before sending.</p>
        <form v-if="currentConversation?.status === 'open'" class="composer" @submit.prevent="submitMessage"><textarea v-model="chatText" class="control textarea" maxlength="4000" rows="2" placeholder="Type a private message…" aria-label="Message" /><BaseButton type="submit" :disabled="messageSending || Boolean(resourceDraftConversationPublicId && currentConversation.publicId !== resourceDraftConversationPublicId)" :aria-label="messageSending ? 'Sending message' : 'Send message'"><span v-if="messageSending" aria-live="polite">Sending…</span><Icon v-else name="Send" /></BaseButton></form>
      </section>
      <aside class="room-aside"><div><span class="section-kicker">Conversation</span><h3>Private conversation</h3><p>Messages are visible to the assigned participants.</p></div><div class="safety-card"><Icon name="ShieldCheck" :size="22" /><h3>Need help?</h3><p>Report a concern without sharing more identity information.</p><button @click="reportOpen = true">Contact safeguarding</button></div></aside>
    </div>
    <div v-if="resourceDialogOpen" class="modal-backdrop" role="presentation" @mousedown.self="resourceDialogOpen = false"><form class="modal resource-form" role="dialog" aria-modal="true" aria-labelledby="resource-title" @submit.prevent="prepareResourceForSend"><span class="modal-icon"><Icon name="BookOpen" :size="24" /></span><h2 id="resource-title">Add a resource</h2><p>This will prepare a message for {{ currentConversation?.otherPartyName || currentConversation?.otherPartyPublicId }}. Review and send it from the conversation when you are ready.</p><label class="field"><span>Resource title</span><input v-model="resourceTitle" class="control" required maxlength="160" autocomplete="off" /></label><label class="field"><span>HTTPS resource link</span><input v-model="resourceUrl" class="control" type="url" required maxlength="2048" placeholder="https://…" autocomplete="url" /></label><label class="field"><span>Optional note</span><textarea v-model="resourceNote" class="control textarea" rows="3" maxlength="1000" placeholder="Add a short note for the person receiving it." /></label><p v-if="resourceError" class="form-error" role="alert">{{ resourceError }}</p><div class="modal-actions"><BaseButton type="button" variant="secondary" @click="resourceDialogOpen = false">Cancel</BaseButton><BaseButton type="submit">Prepare message</BaseButton></div></form></div>
    <div v-if="reportOpen" class="modal-backdrop" role="presentation" @mousedown.self="reportOpen = false"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="report-title"><span class="modal-icon"><Icon name="Flag" :size="24" /></span><h2 id="report-title">Report a concern</h2><p>Share only what the safeguarding team needs to review the concern. This does not provide emergency help.</p><Notice v-if="reportStatus" title="Update" tone="success">{{ reportStatus }}</Notice><Field v-else label="What happened?"><textarea v-model="reportText" class="control textarea" rows="5" maxlength="1000" /></Field><div class="modal-actions"><BaseButton variant="secondary" @click="reportOpen = false">Close</BaseButton><BaseButton v-if="!reportStatus" :disabled="reportLoading" @click="submitReport">{{ reportLoading ? 'Submitting…' : 'Submit securely' }}</BaseButton></div></div></div>
  </AppShell>

  <AppShell v-else-if="route.name === 'guidance'" title="Biblical guidance" eyebrow="Approved resources">
    <section class="panel empty-state"><span><Icon name="BookOpen" :size="26" /></span><h2>No approved resources available</h2><p>Approved Scripture references and guidance will appear here when they are published.</p></section>
  </AppShell>

  <AppShell v-else-if="route.name === 'journey'" title="My discipleship journey" eyebrow="Growing in Christ">
    <section class="journey-hero"><div><Badge tone="success"><Icon name="Sprout" :size="14" />{{ journeyCompletedCount === journeyStages.length ? " Journey complete" : currentJourneyStage === null ? " Not started" : ` Stage ${currentJourneyStage + 1} of ${journeyStages.length}` }}</Badge><h2>Your journey is about faithful steps, not a score.</h2><p>Discipleship is voluntary. You can pause, decline, or talk with your counselor about a different next step.</p><p class="journey-progress-label">Progress: {{ journeyProgressPercent }}%</p></div></section>
    <p v-if="journeyError" class="form-error" role="alert">{{ journeyError }}</p>
    <div v-if="journeyLoading" class="empty-state" role="status"><span><Icon name="Clock3" :size="26" /></span><h2>Loading your journey</h2><p>Your saved progress is being retrieved.</p></div>
    <section v-else class="journey-panel"><div class="journey-stages"><button v-for="(stage, index) in journeyStages" :key="stage.name" :class="journeyStageCompleted(index) ? 'completed' : index === currentJourneyStage ? 'current' : ''" :disabled="journeySavingStage !== null || index !== currentJourneyStage" :aria-label="`Stage ${index + 1}: ${stage.name}${journeyStageCompleted(index) ? ', completed' : index === currentJourneyStage ? ', next stage' : ', locked until earlier stages are completed'}`" @click="updateJourneyStage(index, 'in_progress')"><span><Icon v-if="journeyStageCompleted(index)" name="Check" :size="16" /><template v-else>{{ index + 1 }}</template></span><div><small>Stage {{ index + 1 }}</small><strong>{{ stage.name }}</strong><p>{{ stage.detail }}</p></div><Badge v-if="journeyStageCompleted(index)" tone="success">Completed</Badge><Badge v-else-if="index === currentJourneyStage" tone="blue">{{ realJourney[stage.name] === "in_progress" ? "In progress" : "Next step" }}</Badge><small v-else>Complete earlier stages first</small></button></div><aside class="next-step-card"><span class="section-kicker">Your next step</span><span class="next-icon"><Icon name="CalendarDays" :size="24" /></span><h2>{{ journeyCompletedCount === journeyStages.length ? "Journey complete" : currentJourneyStage === null ? "Choose a stage" : "Continue at your pace" }}</h2><p v-if="journeyCompletedCount === journeyStages.length">You have completed all {{ journeyStages.length }} stages. You can revisit any stage at any time.</p><p v-else>Select the next stage in sequence. Start it, then mark it complete to unlock the following stage. Your journey is voluntary and does not affect account access.</p><BaseButton v-if="journeyCompletedCount < journeyStages.length" :disabled="journeySavingStage !== null" @click="updateJourneyPrimaryStage">{{ currentJourneyStage === null ? "Start your journey" : realJourney[journeyStages[currentJourneyStage].name] === "in_progress" ? "Mark stage complete" : "Start this stage" }}</BaseButton></aside></section>
  </AppShell>

  <AppShell v-else-if="route.name === 'admin'" title="Administration" eyebrow="GCML operations">
    <template v-if="account.user?.role === 'superadmin'" #action><BaseButton @click="changeAdminTab('Users')"><Icon name="Users" :size="17" /> Manage users</BaseButton></template>
    <Notice v-if="account.user && account.user.role !== 'superadmin'" title="This page is not available">Your account does not have SuperAdmin permissions.</Notice>
    <template v-else>
    <Notice title="Administrative privacy boundary">Account management and small-cohort reports are available here. SuperAdmin access does not grant access to private counseling messages.</Notice>
    <div class="admin-tabs"><button v-for="tab in adminTabs" :key="tab" :class="{ active: adminTab === tab }" @click="changeAdminTab(tab)">{{ tab }}</button></div>
    <section v-if="adminTab === 'Counselor Applications'" class="admin-application-workspace">
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
          <div><dt>Requested support categories</dt><dd>{{ adminApplication.supportCategories.join(", ") || "None selected" }}</dd></div>
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
      <div class="table-tools"><label class="search-control"><Icon name="Search" :size="18" /><input v-model="adminSearch" placeholder="Search counselor profiles" /></label></div>
      <div class="data-table"><div class="table-row table-head"><span>Counselor</span><span>Service areas</span><span>Approval</span><span>Account</span><span /></div>
        <div v-for="user in adminSearchResults" :key="user.publicId" class="table-row"><span data-label="Counselor"><b>{{ user.displayName || user.publicId }}</b><small>{{ user.publicId }}</small></span><span data-label="Service areas">{{ user.areas?.join(', ') || 'Not set' }}</span><span data-label="Approval"><Badge :tone="user.approved ? 'success' : 'warning'">{{ user.approved ? 'Approved' : 'Legacy record' }}</Badge></span><span data-label="Account">{{ user.status }}</span><span data-label="Matching categories"><button v-if="user.approved && user.status === 'active'" class="inline-action" type="button" @click="openSpecialtyEditor(user)">Manage matching categories</button><span v-else>Unavailable</span></span></div>
      </div>
      <div v-if="specialtyEditor" class="admin-confirm-overlay" @keydown.esc="specialtyEditor = null">
        <section class="admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="specialty-editor-title">
          <span class="section-kicker">Approved counselor profile</span>
          <h2 id="specialty-editor-title">Matching categories for {{ specialtyEditor.displayName || specialtyEditor.publicId }}</h2>
          <p>Only select categories this active counselor is approved to provide. Changes take effect immediately and are recorded in the audit log.</p>
          <label v-for="category in supportCategories" :key="category.id" class="check-label">
            <input v-model="specialtyEditorIds" type="checkbox" :value="category.id" />
            <span>{{ category.label }}</span>
          </label>
          <p v-if="!supportCategories.length" class="form-error" role="alert">Support categories could not be loaded. Reload the page and try again.</p>
          <p v-if="specialtyEditorError" class="form-error" role="alert">{{ specialtyEditorError }}</p>
          <div class="admin-confirm-actions">
            <BaseButton variant="secondary" :disabled="specialtyEditorSaving" @click="specialtyEditor = null">Cancel</BaseButton>
            <BaseButton :disabled="specialtyEditorSaving || !supportCategories.length" @click="saveCounselorSpecialties">{{ specialtyEditorSaving ? 'Saving…' : 'Save approved categories' }}</BaseButton>
          </div>
        </section>
      </div>
    </section>
    <section v-else-if="adminTab === 'Users'" class="panel admin-panel">
      <label class="search-control"><Icon name="Search" :size="18" /><input v-model="adminSearch" placeholder="Search by public ID or display name" /></label>
      <p v-if="account.error" class="form-error" role="alert">{{ account.error }}</p>
      <Notice title="Account access">Changing a status revokes existing sessions. Staff roles never grant message access by themselves. Anonymizing an account removes sign-in credentials and account profile contact details, while counselor profile/application details, documents, counseling, messages, and audit records are retained. Counselor application details and documents may contain identifying information.</Notice>
      <div class="data-table admin-users-table"><div class="table-row table-head"><span>Account</span><span>Type</span><span>Role</span><span>Status</span><span>Created</span><span>Account actions</span></div>
        <div v-for="user in adminSearchResults" :key="user.publicId" class="table-row"><span data-label="Account"><b>{{ user.displayName || 'Private account' }}</b><small>{{ user.publicId }}<template v-if="user.anonymized"> · Anonymized</template></small></span><span data-label="Type">{{ user.accountType }}</span><span data-label="Role"><select v-if="user.accountType === 'registered' && user.role !== 'counselor'" class="control compact-select" :value="user.role" :disabled="user.anonymized" @change="selectAdminRole(user, $event)"><option value="registered">Registered user</option><option value="superadmin">SuperAdmin</option></select><span v-else-if="user.accountType === 'counselor'">{{ user.role === 'counselor' ? 'Approved counselor' : 'Counselor applicant' }}</span><span v-else-if="user.role === 'counselor'">Legacy counselor</span><span v-else>Anonymous user</span></span><span data-label="Status"><select class="control compact-select" :value="user.status" :disabled="user.anonymized" @change="selectAdminStatus(user, $event)"><option value="active">Active</option><option value="suspended">Suspended</option><option value="deactivated">Deactivated</option></select></span><span data-label="Created">{{ new Date(user.createdAt).toLocaleDateString() }}</span><span data-label="Account actions"><button v-if="!user.anonymized && user.role !== 'superadmin'" class="inline-action admin-delete-user" type="button" @click="requestUserAnonymization(user)">Anonymize &amp; deactivate</button><span v-else-if="user.anonymized">Completed</span><span v-else>Protected</span></span></div>
      </div>
      <div v-if="pendingUserAnonymization" class="admin-confirm-overlay" @keydown.esc="cancelUserAnonymization">
        <section class="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="anonymize-user-title" aria-describedby="anonymize-user-description">
          <span class="section-kicker">Irreversible account action</span>
          <h2 id="anonymize-user-title">Anonymize and deactivate {{ pendingUserAnonymization.publicId }}?</h2>
          <p id="anonymize-user-description">This removes sign-in access, email, account display name and bio, and profile picture, and revokes all sessions. Counseling, counselor profile and application details, documents, conversations, messages, and audit records remain; counselor application details and documents may contain identifying information.</p>
          <p v-if="anonymizationError" class="form-error" role="alert">{{ anonymizationError }}</p>
          <div class="admin-confirm-actions">
            <BaseButton variant="secondary" autofocus :disabled="anonymizationLoading" @click="cancelUserAnonymization">Cancel</BaseButton>
            <BaseButton variant="danger" :disabled="anonymizationLoading" @click="confirmUserAnonymization">{{ anonymizationLoading ? "Working…" : "Anonymize and deactivate" }}</BaseButton>
          </div>
        </section>
      </div>
    </section>
    <section v-else-if="adminTab === 'Safeguarding'" class="panel admin-panel">
      <Notice title="Explicit safeguarding access">Only accounts granted the separate safeguarding-review permission may read report content. This screen does not display or unlock counseling messages.</Notice>
      <div class="data-table"><div class="table-row table-head"><span>Account</span><span>Role</span><span>Status</span><span>Review access</span><span /></div>
        <div v-for="user in adminSearchResults" :key="user.publicId" class="table-row"><span data-label="Account">{{ user.displayName || user.publicId }}<small>{{ user.publicId }}</small></span><span data-label="Role">{{ user.role }}</span><span data-label="Status">{{ user.status }}</span><span data-label="Review access">{{ user.safeguardingReview ? 'Granted' : 'Not granted' }}</span><button class="inline-action" @click="toggleSafeguardingPermission(user)">{{ user.safeguardingReview ? 'Revoke' : 'Grant' }}</button></div>
      </div>
    </section>
    <section v-else-if="adminTab === 'Settings'" class="admin-settings-grid">
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
    <section v-else class="panel"><div class="empty-state"><span><Icon name="MessageCircle" :size="26" /></span><h3>{{ adminTab }} workspace</h3><p>{{ adminTabDescriptions[adminTab] }}</p></div></section>
    </template>
  </AppShell>

  <AppShell v-else-if="route.name === 'reports'" title="Analytics" eyebrow="Live aggregate insights">
    <Notice v-if="account.user && account.user.role !== 'superadmin'" title="This page is not available">Platform analytics are limited to authorized SuperAdmins.</Notice>
    <AdminAnalytics v-else />
  </AppShell>

  <AppShell v-else-if="route.name === 'account-settings'" title="Account settings" eyebrow="Your ShepherdConnect account">
    <Notice v-if="!account.user" title="Sign in to manage your account">
      Your private account settings are available after sign-in.
      <RouterLink to="/sign-in">Sign in securely</RouterLink>
    </Notice>
    <template v-else-if="account.user">
      <section class="panel settings-card">
        <div class="card-heading"><div><span class="section-kicker">Account identity</span><h2>{{ account.user.displayName || "Private account" }}</h2></div><Badge tone="success">{{ account.user.status }}</Badge></div>
        <section class="profile-picture-editor" aria-label="Profile picture settings">
          <ProfileAvatar
            :src="selectedProfilePicturePreview || (account.profilePictureUrl ? apiUrl(account.profilePictureUrl) : null)"
            :name="account.user.displayName || account.user.publicId"
            size="large"
          />
          <div>
            <Field label="Profile picture — optional" hint="Your picture is private to your account. Anonymous users’ pictures are never shown to counselors. JPEG, PNG, or WebP; up to 5 MB.">
              <input class="control file-control" type="file" accept="image/jpeg,image/png,image/webp" @change="selectProfilePicture" />
            </Field>
            <p v-if="profilePictureError" class="form-error" role="alert">{{ profilePictureError }}</p>
            <div class="profile-picture-actions">
              <BaseButton v-if="selectedProfilePicture" variant="secondary" :disabled="profileLoading" @click="saveProfilePicture">
                {{ profileLoading ? "Saving…" : "Save picture" }}
              </BaseButton>
              <BaseButton v-if="account.profilePictureUrl" variant="ghost" :disabled="profileLoading" @click="removeProfilePicture">
                Remove picture
              </BaseButton>
            </div>
          </div>
        </section>
        <dl class="account-details"><div><dt>Public account ID</dt><dd>{{ account.user.publicId }}</dd></div><div><dt>Account type</dt><dd>{{ account.user.accountType === 'anonymous' ? 'Private / anonymous' : account.user.accountType === 'counselor' ? 'Counselor account' : 'Regular user' }}</dd></div><div><dt>Access role</dt><dd>{{ account.user.role }}</dd></div><div><dt>Real-world identity</dt><dd>{{ account.user.accountType === 'anonymous' ? 'Not required' : 'Email provided' }}</dd></div></dl>
        <form v-if="account.user.role !== 'counselor'" class="settings-form" @submit.prevent="saveDisplayName">
          <Field label="Display name" :hint="account.user.accountType === 'anonymous' ? 'Optional. Leave blank to remain a private account.' : 'Shown on your account and to people you connect with.'">
            <input v-model="displayNameDraft" class="control" maxlength="80" autocomplete="nickname" />
          </Field>
          <Field label="About you — optional" hint="A short profile introduction, up to 1000 characters.">
            <textarea v-model="profileBioDraft" class="control textarea" rows="4" maxlength="1000" />
          </Field>
          <BaseButton type="submit" variant="secondary" :disabled="profileLoading">{{ profileLoading ? 'Saving…' : 'Save profile' }}</BaseButton>
        </form>
        <Notice title="Recovery and privacy">Your public ID is for identification in ShepherdConnect, not authentication. Keep your password and one-time recovery code private. Private mode avoids requiring real-world identity, but does not guarantee technical untraceability.</Notice>
        <div class="settings-actions"><BaseButton variant="secondary" :disabled="profileLoading" @click="rotateRecoveryCode">{{ profileLoading ? 'Please wait…' : 'Rotate recovery code' }}</BaseButton><BaseButton variant="danger" :disabled="profileLoading" @click="deactivateAccount">Deactivate account</BaseButton></div>
        <p
          v-if="profileStatus && !recoveryCode"
          :class="['Account profile updated.', 'Counselor profile updated.', 'Private profile information updated.', 'Profile picture updated.', 'Profile picture removed.'].includes(profileStatus) ? 'settings-success' : 'form-error'"
          :role="['Account profile updated.', 'Counselor profile updated.', 'Private profile information updated.', 'Profile picture updated.', 'Profile picture removed.'].includes(profileStatus) ? 'status' : 'alert'"
        >{{ profileStatus }}</p>
        <div v-if="recoveryCode" class="recovery-display settings-recovery" aria-live="polite"><strong>{{ profileStatus }}</strong><code>{{ recoveryCode }}</code><BaseButton variant="secondary" @click="copyRecoveryCode">{{ recoveryCopied ? 'Copied' : 'Copy recovery code' }}</BaseButton><small>This code is shown only now. Save it securely; the old code is invalid.</small></div>
      </section>
      <section v-if="account.user.accountType !== 'anonymous'" class="panel settings-card">
        <span class="section-kicker">Private profile information</span>
        <h2>Age range and gender</h2>
        <p>These optional details are private to your account and are not used to match you with counselors.</p>
        <form class="settings-form" @submit.prevent="saveDemographics">
          <Field label="Age range — optional">
            <select v-model="profileAgeRange" class="control">
              <option value="">Prefer not to provide</option>
              <option value="under_18">Under 18</option>
              <option value="18_24">18–24</option>
              <option value="25_34">25–34</option>
              <option value="35_44">35–44</option>
              <option value="45_54">45–54</option>
              <option value="55_plus">55 and above</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </Field>
          <Field label="Gender — optional">
            <select v-model="profileGender" class="control">
              <option value="" disabled>Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <BaseButton type="submit" variant="secondary" :disabled="profileLoading">
            {{ profileLoading ? 'Saving…' : 'Save private information' }}
          </BaseButton>
        </form>
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
          :support-categories="supportCategories"
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
