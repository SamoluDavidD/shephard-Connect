<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from "vue"

import BaseButton from "./BaseButton.vue"
import Field from "./Field.vue"
import Icon from "./Icon.vue"
import Notice from "./Notice.vue"
import ProfileAvatar from "./ProfileAvatar.vue"

const props = defineProps<{
  busy: boolean
  error: string
  existingAccount?: boolean
}>()
const emit = defineEmits<{
  submit: [payload: FormData, existingAccount: boolean]
}>()

const fields = reactive({
  email: "",
  password: "",
  fullLegalName: "",
  preferredDisplayName: "",
  specialization: "",
  codeOfConductAccepted: false,
  confidentialityAccepted: false,
  safeguardingAccepted: false,
})
const showPassword = ref(false)
const profilePicture = ref<File | null>(null)
const profilePicturePreview = ref<string | null>(null)
const pictureError = ref("")

function selectProfilePicture(event: Event) {
  const input = event.currentTarget
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0] || null
  pictureError.value = ""
  if (profilePicturePreview.value) URL.revokeObjectURL(profilePicturePreview.value)
  profilePicturePreview.value = null
  profilePicture.value = null
  if (!file) return
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    pictureError.value = "Choose a JPEG, PNG, or WebP image."
    input.value = ""
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    pictureError.value = "Profile pictures must be 5 MB or smaller."
    input.value = ""
    return
  }
  profilePicture.value = file
  profilePicturePreview.value = URL.createObjectURL(file)
}

onBeforeUnmount(() => {
  if (profilePicturePreview.value) URL.revokeObjectURL(profilePicturePreview.value)
})

function submit(event: Event) {
  const form = event.currentTarget
  if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return
  const payload = new FormData()
  payload.set(
    "application",
    JSON.stringify({
      ...(props.existingAccount
        ? {
            fullLegalName: fields.fullLegalName,
            preferredDisplayName: fields.preferredDisplayName || null,
            specialization: fields.specialization,
            codeOfConductAccepted: fields.codeOfConductAccepted,
            confidentialityAccepted: fields.confidentialityAccepted,
            safeguardingAccepted: fields.safeguardingAccepted,
          }
        : {
            ...fields,
            preferredDisplayName: fields.preferredDisplayName || null,
          }),
    }),
  )
  if (profilePicture.value) payload.set("profilePicture", profilePicture.value)
  emit("submit", payload, Boolean(props.existingAccount))
}
</script>

<template>
  <form class="counselor-registration-form" @submit.prevent="submit">
    <Notice title="Counselor applications require SuperAdmin approval">
      {{ props.existingAccount
        ? "This application will use your existing account and sign-in details. Counselor access is enabled only after SuperAdmin approval."
        : "Registration collects only essential account information. After approval, you can choose whether to complete your professional profile or upload supporting documents." }}
    </Notice>

    <div class="registration-section">
      <h3>Account and essential information</h3>
      <Field label="Full legal name">
        <input v-model="fields.fullLegalName" class="control" required maxlength="160" autocomplete="name" />
      </Field>
      <Field label="Preferred display name" hint="Optional; your full name will be used if left blank">
        <input v-model="fields.preferredDisplayName" class="control" maxlength="80" />
      </Field>
      <Field v-if="!props.existingAccount" label="Email address">
        <input v-model="fields.email" class="control" type="email" required maxlength="254" autocomplete="email" />
      </Field>
      <Field label="Counseling specialization or area of interest">
        <input v-model="fields.specialization" class="control" required maxlength="160" />
      </Field>
      <Field v-if="!props.existingAccount" label="Profile picture — optional" hint="JPEG, PNG, or WebP; up to 5 MB. You can change or remove it later.">
        <div class="profile-picture-field">
          <ProfileAvatar
            v-if="profilePicturePreview"
            class="profile-picture-preview"
            :src="profilePicturePreview"
            :name="fields.preferredDisplayName || fields.fullLegalName || 'Your profile'"
            size="medium"
          />
          <span v-else class="profile-picture-preview profile-picture-placeholder"><Icon name="UserRound" :size="24" /></span>
          <input class="control file-control" type="file" accept="image/jpeg,image/png,image/webp" @change="selectProfilePicture" />
        </div>
      </Field>
      <p v-if="pictureError" class="form-error" role="alert">{{ pictureError }}</p>
    </div>

    <Field v-if="!props.existingAccount" label="Password" hint="Use at least 12 characters.">
      <div class="password-control">
        <input v-model="fields.password" class="control" :type="showPassword ? 'text' : 'password'" minlength="12" maxlength="128" required autocomplete="new-password" />
        <button type="button" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
          <Icon :name="showPassword ? 'EyeOff' : 'Eye'" />
        </button>
      </div>
    </Field>
    <label class="check-label">
      <input v-model="fields.codeOfConductAccepted" type="checkbox" required />
      <span>I accept the counselor code of conduct.</span>
    </label>
    <label class="check-label">
      <input v-model="fields.confidentialityAccepted" type="checkbox" required />
      <span>I accept the confidentiality requirements.</span>
    </label>
    <label class="check-label">
      <input v-model="fields.safeguardingAccepted" type="checkbox" required />
      <span>I accept the safeguarding policies and understand their limits.</span>
    </label>
    <p v-if="props.error" class="form-error" role="alert">{{ props.error }}</p>
    <BaseButton type="submit" class-name="submit-wide" :disabled="props.busy">
      {{ props.busy ? "Submitting application…" : "Submit counselor application" }}
    </BaseButton>
  </form>
</template>
