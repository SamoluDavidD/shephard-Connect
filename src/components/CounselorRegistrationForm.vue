<script setup lang="ts">
import { reactive, ref } from "vue"

import BaseButton from "./BaseButton.vue"
import Field from "./Field.vue"
import Icon from "./Icon.vue"
import Notice from "./Notice.vue"

const props = defineProps<{
  busy: boolean
  error: string
}>()
const emit = defineEmits<{
  submit: [payload: FormData]
}>()

const fields = reactive({
  email: "",
  password: "",
  fullLegalName: "",
  preferredDisplayName: "",
  phone: "",
  country: "",
  generalLocation: "",
  professionalTitle: "",
  specialization: "",
  highestQualification: "",
  institution: "",
  qualificationType: "",
  completionYear: "",
  certifications: "",
  yearsExperience: "0",
  licenseNumber: "",
  licensingAuthority: "",
  licenseExpiry: "",
  biography: "",
  areasOfExpertise: "",
  languages: "",
  workHistory: "",
  referencesText: "",
  codeOfConductAccepted: false,
  confidentialityAccepted: false,
  safeguardingAccepted: false,
})
const showPassword = ref(false)
const acceptedTypes = ".pdf,.jpg,.jpeg,.png"

function splitList(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))]
}

function submit(event: Event) {
  const form = event.currentTarget
  if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return
  const payload = new FormData()
  payload.set(
    "application",
    JSON.stringify({
      ...fields,
      completionYear: fields.completionYear ? Number(fields.completionYear) : null,
      yearsExperience: Number(fields.yearsExperience),
      areasOfExpertise: splitList(fields.areasOfExpertise),
      languages: splitList(fields.languages),
      licenseExpiry: fields.licenseExpiry || null,
    }),
  )
  for (const [inputName, fieldName] of [
    ["qualificationDocuments", "qualificationDocuments"],
    ["licenseDocuments", "licenseDocuments"],
    ["supportingDocuments", "supportingDocuments"],
    ["profilePhoto", "profilePhoto"],
  ]) {
    const input = form.elements.namedItem(inputName)
    if (!(input instanceof HTMLInputElement) || !input.files) continue
    for (const file of input.files) payload.append(fieldName, file)
  }
  emit("submit", payload)
}
</script>

<template>
  <form class="counselor-registration-form" @submit.prevent="submit">
    <Notice title="Counselor applications require SuperAdmin approval">
      Submitting this application does not grant counselor permissions. Submitted qualifications are treated as applicant-provided until a reviewer verifies them.
    </Notice>

    <div class="registration-section">
      <h3>Account and contact</h3>
      <Field label="Full legal name">
        <input v-model="fields.fullLegalName" class="control" required maxlength="160" autocomplete="name" />
      </Field>
      <Field label="Preferred display name">
        <input v-model="fields.preferredDisplayName" class="control" required maxlength="80" />
      </Field>
      <Field label="Email address">
        <input v-model="fields.email" class="control" type="email" required maxlength="254" autocomplete="email" />
      </Field>
      <Field label="Phone number" hint="Optional unless required for verification">
        <input v-model="fields.phone" class="control" type="tel" maxlength="40" autocomplete="tel" />
      </Field>
      <Field label="Country">
        <input v-model="fields.country" class="control" required maxlength="100" autocomplete="country-name" />
      </Field>
      <Field label="General location">
        <input v-model="fields.generalLocation" class="control" required maxlength="160" placeholder="City, region, or district" />
      </Field>
    </div>

    <div class="registration-section">
      <h3>Professional credentials</h3>
      <Field label="Professional title">
        <input v-model="fields.professionalTitle" class="control" required maxlength="120" placeholder="e.g. Pastoral counselor" />
      </Field>
      <Field label="Counseling specialization">
        <input v-model="fields.specialization" class="control" required maxlength="160" />
      </Field>
      <Field label="Highest relevant qualification">
        <input v-model="fields.highestQualification" class="control" required maxlength="180" />
      </Field>
      <Field label="Institution attended">
        <input v-model="fields.institution" class="control" required maxlength="180" />
      </Field>
      <Field label="Qualification type">
        <input v-model="fields.qualificationType" class="control" required maxlength="120" placeholder="Degree, diploma, certificate, or equivalent" />
      </Field>
      <Field label="Completion year" hint="Optional">
        <input v-model="fields.completionYear" class="control" type="number" min="1900" max="2100" />
      </Field>
      <Field label="Relevant certifications and issuing organizations" hint="Optional; list one per line">
        <textarea v-model="fields.certifications" class="control textarea" rows="3" maxlength="3000" />
      </Field>
      <Field label="Years of relevant experience">
        <input v-model="fields.yearsExperience" class="control" type="number" min="0" max="80" required />
      </Field>
      <Field label="Professional license or registration number" hint="Optional where not applicable">
        <input v-model="fields.licenseNumber" class="control" maxlength="160" />
      </Field>
      <Field label="Licensing authority" hint="Required if you provide a license number">
        <input v-model="fields.licensingAuthority" class="control" maxlength="180" :required="Boolean(fields.licenseNumber)" />
      </Field>
      <Field label="License expiration date" hint="Optional">
        <input v-model="fields.licenseExpiry" class="control" type="date" />
      </Field>
    </div>

    <div class="registration-section">
      <h3>Professional experience</h3>
      <Field label="Professional biography" hint="At least 30 characters">
        <textarea v-model="fields.biography" class="control textarea" rows="5" minlength="30" maxlength="5000" required />
      </Field>
      <Field label="Areas of expertise" hint="Separate items with commas">
        <input v-model="fields.areasOfExpertise" class="control" maxlength="1000" placeholder="Pastoral counseling, family support, youth counseling" />
      </Field>
      <Field label="Languages spoken" hint="Separate items with commas">
        <input v-model="fields.languages" class="control" maxlength="600" placeholder="English, Kpelle" />
      </Field>
      <Field label="Relevant work history" hint="Optional">
        <textarea v-model="fields.workHistory" class="control textarea" rows="4" maxlength="5000" />
      </Field>
      <Field label="Professional references" hint="Optional; share only information you are authorized to provide">
        <textarea v-model="fields.referencesText" class="control textarea" rows="3" maxlength="3000" />
      </Field>
    </div>

    <div class="registration-section">
      <h3>Supporting documents (all optional)</h3>
      <p class="field-hint">You can submit the application without files. A SuperAdmin may request documents later. Accepted formats: PDF, JPEG, PNG; maximum 10 MB per file and five files per submission.</p>
      <Field label="Qualification certificates — optional">
        <input class="control file-control" type="file" name="qualificationDocuments" :accept="acceptedTypes" multiple />
      </Field>
      <Field label="License or registration evidence — optional">
        <input class="control file-control" type="file" name="licenseDocuments" :accept="acceptedTypes" multiple />
      </Field>
      <Field label="Additional supporting documents — optional">
        <input class="control file-control" type="file" name="supportingDocuments" :accept="acceptedTypes" multiple />
      </Field>
      <Field label="Profile photograph — optional" hint="JPEG or PNG">
        <input class="control file-control" type="file" name="profilePhoto" accept=".jpg,.jpeg,.png" />
      </Field>
    </div>

    <Field label="Password">
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
