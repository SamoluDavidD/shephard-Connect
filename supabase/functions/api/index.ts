import { createClient } from "npm:@supabase/supabase-js@2";
import { type Context, Hono, type Next } from "npm:hono";

type ApiAccount = {
  id: string;
  public_id: string;
  account_type: "anonymous" | "registered" | "counselor";
  role: "anonymous" | "registered" | "counselor" | "superadmin";
  status: "active" | "suspended" | "deactivated";
  user_profiles:
    | { display_name: string | null }
    | { display_name: string | null }[]
    | null;
};

type ApiEnvironment = {
  Variables: {
    account: ApiAccount;
  };
};

type CounselorDirectoryEntry = {
  headline: string;
  bio: string;
  areas: string[];
  languages: string[];
  users:
    | {
      public_id: string;
      user_profiles:
        | {
          display_name: string | null;
          picture_storage_key: string | null;
          updated_at: string;
        }
        | {
          display_name: string | null;
          picture_storage_key: string | null;
          updated_at: string;
        }[]
        | null;
    }
    | {
      public_id: string;
      user_profiles:
        | {
          display_name: string | null;
          picture_storage_key: string | null;
          updated_at: string;
        }
        | {
          display_name: string | null;
          picture_storage_key: string | null;
          updated_at: string;
        }[]
        | null;
    }[]
    | null;
  counselor_specialties?: {
    category_id: string;
    approved: boolean;
    support_categories:
      | { label: string; active: boolean }
      | { label: string; active: boolean }[]
      | null;
  }[];
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigins = new Set(
  (Deno.env.get("APP_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

if (!supabaseUrl || !anonKey || !serviceRoleKey || allowedOrigins.size === 0) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and APP_ORIGINS must be configured.",
  );
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
export const app = new Hono<ApiEnvironment>();

const requireAccount = async (
  context: Context<ApiEnvironment>,
  next: Next,
) => {
  const token = context.req.header("authorization")?.match(/^Bearer ([^\s]+)$/i)
    ?.[1];
  if (!token) {
    return context.json({ error: "Authentication is required." }, 401);
  }

  const { data: authResult, error: authError } = await authClient.auth.getUser(
    token,
  );
  if (authError || !authResult.user) {
    return context.json({
      error: "The supplied credentials could not be verified.",
    }, 401);
  }

  const { data, error } = await admin
    .from("users")
    .select(
      "id, public_id, account_type, role, status, user_profiles(display_name)",
    )
    .eq("auth_user_id", authResult.user.id)
    .maybeSingle();

  if (error) {
    console.error("Supabase account lookup failed:", error.message);
    return context.json({ error: "Account status could not be checked." }, 500);
  }
  if (!data || data.status !== "active") {
    return context.json(
      { error: "The requested account is not available." },
      401,
    );
  }

  context.set("account", data);
  await next();
};

app.use("*", async (context, next) => {
  const origin = context.req.header("origin");
  if (origin && !allowedOrigins.has(origin)) {
    return context.json({ error: "This request origin is not allowed." }, 403);
  }

  if (origin) {
    context.header("Access-Control-Allow-Origin", origin);
    context.header("Vary", "Origin");
  }
  context.header(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, apikey, x-client-info, x-supabase-api-version",
  );
  context.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );

  if (context.req.method === "OPTIONS") return context.body(null, 204);
  await next();
});

app.onError((error, context) => {
  console.error("Supabase API request failed:", error.message);
  return context.json({
    error: "The request could not be completed right now.",
  }, 500);
});

app.notFound((context) =>
  context.json({ error: "The requested resource was not found." }, 404)
);

app.get("/health", (context) => context.json({ status: "ok" }));

app.get("/support-categories", async (context) => {
  const { data, error } = await admin
    .from("support_categories")
    .select("id, label")
    .eq("active", true)
    .order("label");

  if (error) {
    console.error("Supabase support category query failed:", error.message);
    return context.json(
      { error: "Support categories could not be loaded." },
      500,
    );
  }
  return context.json({ categories: data });
});

app.get("/counselors", async (context) => {
  const { data, error } = await admin
    .from("counselor_profiles")
    .select(
      "headline, bio, areas, languages, users!inner(public_id, status, role, user_profiles(display_name, picture_storage_key, updated_at))",
    )
    .eq("approved", true)
    .eq("users.status", "active")
    .eq("users.role", "counselor");

  if (error) {
    console.error("Supabase counselor directory query failed:", error.message);
    return context.json({
      error: "The counselor directory could not be loaded.",
    }, 500);
  }

  const counselors = ((data || []) as CounselorDirectoryEntry[])
    .flatMap((counselor) => {
      const user = Array.isArray(counselor.users)
        ? counselor.users[0]
        : counselor.users;
      if (!user) return [];
      const userProfile = Array.isArray(user.user_profiles)
        ? user.user_profiles[0]
        : user.user_profiles;
      return [{
        publicId: user.public_id,
        displayName: userProfile?.display_name ?? null,
        headline: counselor.headline,
        bio: counselor.bio,
        areas: counselor.areas,
        languages: counselor.languages,
        pictureUrl: null,
      }];
    })
    .sort((left, right) =>
      (left.displayName || "").localeCompare(right.displayName || "")
    );

  return context.json({ counselors });
});

app.get("/counselors/matches", async (context) => {
  const categoryId = context.req.query("categoryId")?.trim() || null;
  const browseAll = context.req.query("all") === "true";
  if ((!browseAll && !categoryId) || (browseAll && categoryId)) {
    return context.json(
      {
        error:
          "Choose a support category or explicitly select all available counselors.",
      },
      400,
    );
  }

  if (categoryId) {
    const { data: category, error: categoryError } = await admin
      .from("support_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("active", true)
      .maybeSingle();

    if (categoryError) {
      console.error(
        "Supabase support category validation failed:",
        categoryError.message,
      );
      return context.json({
        error: "The support category could not be checked.",
      }, 500);
    }
    if (!category) {
      return context.json({ error: "Choose an active support category." }, 400);
    }
  }

  let query = admin
    .from("counselor_profiles")
    .select(
      "headline, bio, areas, languages, users!inner(public_id, status, role, user_profiles(display_name, picture_storage_key, updated_at)), counselor_specialties(category_id, approved, support_categories(label, active))",
    )
    .eq("approved", true)
    .eq("users.status", "active")
    .eq("users.role", "counselor")
    .eq("counselor_specialties.approved", true)
    .eq("counselor_specialties.support_categories.active", true);

  if (categoryId) {
    query = query.eq("counselor_specialties.category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Supabase counselor matching query failed:", error.message);
    return context.json(
      { error: "Matching counselors could not be loaded." },
      500,
    );
  }

  const counselors = ((data || []) as CounselorDirectoryEntry[])
    .flatMap((counselor) => {
      const user = Array.isArray(counselor.users)
        ? counselor.users[0]
        : counselor.users;
      if (!user) return [];
      const userProfile = Array.isArray(user.user_profiles)
        ? user.user_profiles[0]
        : user.user_profiles;
      const specialties = (counselor.counselor_specialties || []).flatMap(
        (specialty) => {
          const category = Array.isArray(specialty.support_categories)
            ? specialty.support_categories[0]
            : specialty.support_categories;
          if (!specialty.approved || !category?.active) return [];
          return [{ categoryId: specialty.category_id, label: category.label }];
        },
      );
      return {
        publicId: user.public_id,
        displayName: userProfile?.display_name ?? null,
        headline: counselor.headline,
        bio: counselor.bio,
        areas: [
          ...new Set([
            ...counselor.areas,
            ...specialties.map((specialty) => specialty.label),
          ]),
        ],
        specialties: specialties.map((specialty) => specialty.label),
        specialtyIds: specialties.map((specialty) => specialty.categoryId),
        languages: counselor.languages,
        pictureUrl: null,
      };
    })
    .filter((counselor) =>
      !categoryId || counselor.specialtyIds.includes(categoryId)
    )
    .sort((left, right) =>
      (left.displayName || "").localeCompare(right.displayName || "")
    );

  return context.json({ counselors });
});

app.get("/me", requireAccount, (context) => {
  const data = context.get("account");
  const profile = Array.isArray(data.user_profiles)
    ? data.user_profiles[0]
    : data.user_profiles;

  return context.json({
    user: {
      publicId: data.public_id,
      accountType: data.account_type,
      role: data.role,
      status: data.status,
      displayName: profile?.display_name || null,
    },
  });
});

app.get("/me/profile", requireAccount, async (context) => {
  const account = context.get("account");
  const { data, error } = await admin
    .from("user_profiles")
    .select("display_name, bio, age_range, gender, picture_storage_key")
    .eq("user_id", account.id)
    .maybeSingle();

  if (error) {
    console.error("Supabase profile lookup failed:", error.message);
    return context.json({ error: "The profile could not be loaded." }, 500);
  }
  if (!data) return context.json({ error: "Profile was not found." }, 404);

  return context.json({
    profile: {
      displayName: data.display_name,
      bio: data.bio,
      ageRange: data.age_range,
      gender: data.gender,
      pictureUrl: null,
    },
  });
});

app.patch("/me", requireAccount, async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return context.json(
      { error: "Check the submitted profile information." },
      400,
    );
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return context.json(
      { error: "Check the submitted profile information." },
      400,
    );
  }

  const input = body as Record<string, unknown>;
  const allowedKeys = new Set(["displayName", "bio", "ageRange", "gender"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    return context.json(
      { error: "Check the submitted profile information." },
      400,
    );
  }
  if (
    !("displayName" in input) ||
    (input.displayName !== null &&
      (typeof input.displayName !== "string" ||
        input.displayName.trim().length < 1 ||
        input.displayName.trim().length > 80)) ||
    ("bio" in input &&
      (typeof input.bio !== "string" || input.bio.trim().length > 1000)) ||
    ("ageRange" in input &&
      input.ageRange !== null &&
      ![
        "under_18",
        "18_24",
        "25_34",
        "35_44",
        "45_54",
        "55_plus",
        "prefer_not_to_say",
      ].includes(String(input.ageRange))) ||
    ("gender" in input &&
      input.gender !== null &&
      input.gender !== "male" &&
      input.gender !== "female")
  ) {
    return context.json(
      { error: "Check the submitted profile information." },
      400,
    );
  }

  const account = context.get("account");
  if (
    account.account_type === "anonymous" &&
    ("ageRange" in input || "gender" in input)
  ) {
    return context.json(
      { error: "Private accounts do not collect demographic information." },
      403,
    );
  }

  const updates: Record<string, unknown> = {
    display_name: typeof input.displayName === "string"
      ? input.displayName.trim()
      : null,
  };
  if ("bio" in input) updates.bio = (input.bio as string).trim();
  if ("ageRange" in input) updates.age_range = input.ageRange;
  if ("gender" in input) updates.gender = input.gender;

  const { data, error } = await admin
    .from("user_profiles")
    .update(updates)
    .eq("user_id", account.id)
    .select("display_name")
    .maybeSingle();

  if (error) {
    console.error("Supabase profile update failed:", error.message);
    return context.json({ error: "The profile could not be updated." }, 500);
  }
  if (!data) return context.json({ error: "Profile was not found." }, 404);

  return context.json({
    user: {
      publicId: account.public_id,
      accountType: account.account_type,
      role: account.role,
      status: account.status,
      displayName: data.display_name,
    },
  });
});

app.get("/notifications", requireAccount, async (context) => {
  const account = context.get("account");
  const { data, error } = await admin
    .from("user_notifications")
    .select("id, kind, title, message, created_at, read_at")
    .eq("user_id", account.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Supabase notification query failed:", error.message);
    return context.json({ error: "Notifications could not be loaded." }, 500);
  }
  return context.json({ notifications: data });
});

app.patch("/notifications/:id/read", requireAccount, async (context) => {
  const id = context.req.param("id") || "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(id)
  ) {
    return context.json({ error: "Invalid notification identifier." }, 400);
  }

  const account = context.get("account");
  const { data: existing, error: lookupError } = await admin
    .from("user_notifications")
    .select("id, read_at")
    .eq("id", id)
    .eq("user_id", account.id)
    .maybeSingle();

  if (lookupError) {
    console.error("Supabase notification lookup failed:", lookupError.message);
    return context.json(
      { error: "The notification could not be updated." },
      500,
    );
  }
  if (!existing) {
    return context.json({ error: "Notification was not found." }, 404);
  }
  if (existing.read_at) return context.body(null, 204);

  const { error } = await admin
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", account.id);

  if (error) {
    console.error("Supabase notification update failed:", error.message);
    return context.json(
      { error: "The notification could not be updated." },
      500,
    );
  }
  return context.body(null, 204);
});

app.get("/requests", requireAccount, async (context) => {
  const account = context.get("account");
  const isSeeker = ["anonymous", "registered"].includes(account.role) &&
    account.account_type !== "counselor";
  const isCounselor = account.role === "counselor";
  if (!isSeeker && !isCounselor) {
    return context.json({
      error: "You are not permitted to view counseling requests.",
    }, 403);
  }

  const query = admin
    .from("counseling_requests")
    .select(
      "id, public_ref, seeker_id, counselor_id, need, support_category_id, topic, description, status, created_at",
    )
    .eq(isSeeker ? "seeker_id" : "counselor_id", account.id)
    .order("created_at", { ascending: false });
  const { data: requests, error } = await query;
  if (error) {
    console.error("Supabase request list query failed:", error.message);
    return context.json(
      { error: "Counseling requests could not be loaded." },
      500,
    );
  }
  if (!requests?.length) return context.json({ requests: [] });

  const otherUserIds = [
    ...new Set(
      requests.map((request) =>
        isSeeker ? request.counselor_id : request.seeker_id
      ),
    ),
  ];
  const counselorIds = [
    ...new Set(requests.map((request) => request.counselor_id)),
  ];
  const [
    { data: users, error: usersError },
    { data: categories, error: categoriesError },
    { data: counselorProfiles, error: counselorProfilesError },
  ] = await Promise.all([
    admin.from("users").select("id, public_id").in("id", otherUserIds),
    admin.from("support_categories").select("id, label").in(
      "id",
      [
        ...new Set(
          requests.flatMap((request) => request.support_category_id || []),
        ),
      ],
    ),
    admin.from("user_profiles").select("user_id, display_name").in(
      "user_id",
      counselorIds,
    ),
  ]);

  if (usersError || categoriesError || counselorProfilesError) {
    console.error(
      "Supabase request context lookup failed:",
      usersError?.message || categoriesError?.message ||
        counselorProfilesError?.message,
    );
    return context.json(
      { error: "Counseling requests could not be loaded." },
      500,
    );
  }

  const userById = new Map((users || []).map((user) => [user.id, user]));
  const categoryById = new Map((categories || []).map((category) => [
    category.id,
    category.label,
  ]));
  const counselorNameById = new Map((counselorProfiles || []).map((profile) => [
    profile.user_id,
    profile.display_name,
  ]));
  return context.json({
    requests: requests.map((request) => ({
      public_ref: request.public_ref,
      need: request.need,
      support_category_id: request.support_category_id,
      support_category_label: request.support_category_id
        ? categoryById.get(request.support_category_id) || null
        : null,
      topic: request.topic,
      description: request.description,
      status: request.status,
      created_at: request.created_at,
      seeker_public_id: isSeeker
        ? account.public_id
        : userById.get(request.seeker_id)?.public_id || null,
      counselor_public_id: isCounselor
        ? account.public_id
        : userById.get(request.counselor_id)?.public_id || null,
      counselor_name: counselorNameById.get(request.counselor_id) || null,
    })),
  });
});

app.get("/conversations", requireAccount, async (context) => {
  const account = context.get("account");
  const isSeeker = ["anonymous", "registered"].includes(account.role) &&
    account.account_type !== "counselor";
  const isCounselor = account.role === "counselor";
  if (!isSeeker && !isCounselor) {
    return context.json({
      error: "You are not permitted to view conversations.",
    }, 403);
  }

  const { data: conversations, error } = await admin
    .from("counseling_conversations")
    .select("public_id, seeker_id, counselor_id, status, updated_at")
    .eq(isSeeker ? "seeker_id" : "counselor_id", account.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Supabase conversation list query failed:", error.message);
    return context.json({ error: "Conversations could not be loaded." }, 500);
  }
  if (!conversations?.length) return context.json({ conversations: [] });

  const otherUserIds = [
    ...new Set(
      conversations.map((conversation) =>
        isSeeker ? conversation.counselor_id : conversation.seeker_id
      ),
    ),
  ];
  const { data: users, error: usersError } = await admin
    .from("users")
    .select("id, public_id, account_type")
    .in("id", otherUserIds);

  if (usersError) {
    console.error(
      "Supabase conversation participant lookup failed:",
      usersError.message,
    );
    return context.json({ error: "Conversations could not be loaded." }, 500);
  }

  const otherUsers = users || [];
  const otherUserIdsWithProfiles = otherUsers
    .filter((user) => user.account_type !== "anonymous")
    .map((user) => user.id);
  const { data: profiles, error: profilesError } =
    otherUserIdsWithProfiles.length
      ? await admin
        .from("user_profiles")
        .select("user_id, display_name")
        .in("user_id", otherUserIdsWithProfiles)
      : { data: [], error: null };

  if (profilesError) {
    console.error(
      "Supabase conversation profile lookup failed:",
      profilesError.message,
    );
    return context.json({ error: "Conversations could not be loaded." }, 500);
  }

  const userById = new Map(otherUsers.map((user) => [user.id, user]));
  const nameByUserId = new Map((profiles || []).map((profile) => [
    profile.user_id,
    profile.display_name,
  ]));
  return context.json({
    conversations: conversations.map((conversation) => {
      const otherUser = userById.get(
        isSeeker ? conversation.counselor_id : conversation.seeker_id,
      );
      const isAnonymous = otherUser?.account_type === "anonymous";
      return {
        public_id: conversation.public_id,
        status: conversation.status,
        updated_at: conversation.updated_at,
        other_party_public_id: otherUser?.public_id || null,
        other_party_display_name: isAnonymous
          ? otherUser?.public_id || null
          : nameByUserId.get(otherUser?.id || "") || otherUser?.public_id ||
            null,
        other_party_is_anonymous: isAnonymous,
        other_party_picture_url: null,
      };
    }),
  });
});

app.post("/requests", requireAccount, async (context) => {
  const account = context.get("account");
  if (
    !["anonymous", "registered"].includes(account.role) ||
    account.account_type === "counselor"
  ) {
    return context.json({
      error:
        "Counselor applicants may only use their application account features.",
    }, 403);
  }

  let input: Record<string, unknown>;
  try {
    const body: unknown = await context.req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("Invalid request body");
    }
    input = body as Record<string, unknown>;
  } catch {
    return context.json(
      { error: "Check the submitted request information." },
      400,
    );
  }
  const counselorPublicId = typeof input.counselorPublicId === "string"
    ? input.counselorPublicId.trim()
    : "";
  const need = typeof input.need === "string" ? input.need.trim() : "";
  const supportCategoryId = typeof input.supportCategoryId === "string"
    ? input.supportCategoryId.trim()
    : "";
  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  const description = typeof input.description === "string"
    ? input.description.trim()
    : "";
  if (
    counselorPublicId.length < 4 || counselorPublicId.length > 24 ||
    need.length < 1 || need.length > 120 ||
    supportCategoryId.length < 1 || supportCategoryId.length > 80 ||
    topic.length < 3 || topic.length > 160 ||
    description.length > 4000
  ) {
    return context.json(
      { error: "Check the submitted request information." },
      400,
    );
  }

  const { data, error } = await admin.rpc("sc_create_counseling_request", {
    p_seeker_id: account.id,
    p_counselor_public_id: counselorPublicId,
    p_need: need,
    p_category_id: supportCategoryId,
    p_topic: topic,
    p_description: description,
  });
  if (error) {
    console.error("Supabase request creation failed:", error.message);
    return context.json({
      error: "The request could not be created right now.",
    }, 500);
  }

  const result = data as { error?: string; request?: Record<string, unknown> };
  if (result.error === "invalid_category") {
    return context.json({
      error: "Choose a valid support category for this request.",
    }, 400);
  }
  if (result.error === "counselor_unavailable") {
    return context.json({
      error:
        "That counselor is not available for the selected support category.",
    }, 404);
  }
  if (result.error === "not_permitted") {
    return context.json(
      { error: "You are not permitted to create requests." },
      403,
    );
  }
  if (!result.request) {
    console.error("Supabase request creation returned an invalid result.");
    return context.json({
      error: "The request could not be created right now.",
    }, 500);
  }
  return context.json({ request: result.request }, 201);
});

app.patch("/requests/:publicRef/status", requireAccount, async (context) => {
  const account = context.get("account");
  const status = (await context.req.json().catch(() => null)) as
    | { status?: unknown }
    | null;
  if (
    !status || typeof status.status !== "string" ||
    !["Accepted", "Declined", "Cancelled", "Closed"].includes(status.status)
  ) {
    return context.json({ error: "Check the submitted request status." }, 400);
  }

  const { data, error } = await admin.rpc("sc_change_request_status", {
    p_actor_id: account.id,
    p_public_ref: context.req.param("publicRef"),
    p_status: status.status,
  });
  if (error) {
    console.error("Supabase request status update failed:", error.message);
    return context.json({
      error: "The request could not be updated right now.",
    }, 500);
  }

  const result = data as {
    error?: string;
    request?: Record<string, unknown>;
    conversation?: string | null;
  };
  if (result.error === "not_found") {
    return context.json({ error: "The requested record was not found." }, 404);
  }
  if (result.error === "conflict") {
    return context.json({ error: "That status change is not allowed." }, 409);
  }
  if (!result.request) {
    console.error("Supabase status update returned an invalid result.");
    return context.json({
      error: "The request could not be updated right now.",
    }, 500);
  }
  return context.json({
    request: result.request,
    conversation: result.conversation || null,
  });
});

app.get(
  "/conversations/:publicId/messages",
  requireAccount,
  async (context) => {
    const account = context.get("account");
    const publicId = (context.req.param("publicId") || "").toUpperCase();
    const { data: conversation, error: conversationError } = await admin
      .from("counseling_conversations")
      .select("id, seeker_id, counselor_id")
      .eq("public_id", publicId)
      .maybeSingle();
    if (conversationError) {
      console.error(
        "Supabase conversation lookup failed:",
        conversationError.message,
      );
      return context.json(
        { error: "The conversation could not be loaded." },
        500,
      );
    }
    if (
      !conversation ||
      ![conversation.seeker_id, conversation.counselor_id].includes(account.id)
    ) {
      return context.json(
        { error: "The requested record was not found." },
        404,
      );
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: account.id,
      action: "conversation.messages_viewed",
      target_type: "conversation",
      target_id: conversation.id,
    });
    if (auditError) {
      console.error(
        "Supabase conversation view audit failed:",
        auditError.message,
      );
      return context.json({
        error: "Conversation messages could not be loaded.",
      }, 500);
    }

    const [
      { data: messages, error: messagesError },
      { data: hidden, error: hiddenError },
    ] = await Promise.all([
      admin
        .from("messages")
        .select(
          "id, sender_id, body, created_at, edited_at, deleted_at, delivered_at, read_at",
        )
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      admin
        .from("message_user_hides")
        .select("message_id")
        .eq("user_id", account.id),
    ]);
    if (messagesError || hiddenError) {
      console.error(
        "Supabase conversation messages query failed:",
        messagesError?.message || hiddenError?.message,
      );
      return context.json({
        error: "Conversation messages could not be loaded.",
      }, 500);
    }

    const hiddenIds = new Set((hidden || []).map((item) => item.message_id));
    const visibleMessages = (messages || []).filter((message) =>
      !hiddenIds.has(message.id)
    );
    const senderIds = [
      ...new Set(visibleMessages.map((message) => message.sender_id)),
    ];
    const { data: senders, error: sendersError } = senderIds.length
      ? await admin
        .from("users")
        .select("id, public_id, role, account_type")
        .in("id", senderIds)
      : { data: [], error: null };
    if (sendersError) {
      console.error(
        "Supabase message sender lookup failed:",
        sendersError.message,
      );
      return context.json({
        error: "Conversation messages could not be loaded.",
      }, 500);
    }
    const nonAnonymousIds = (senders || [])
      .filter((sender) => sender.account_type !== "anonymous")
      .map((sender) => sender.id);
    const { data: profiles, error: profilesError } = nonAnonymousIds.length
      ? await admin
        .from("user_profiles")
        .select("user_id, display_name")
        .in("user_id", nonAnonymousIds)
      : { data: [], error: null };
    if (profilesError) {
      console.error(
        "Supabase message profile lookup failed:",
        profilesError.message,
      );
      return context.json({
        error: "Conversation messages could not be loaded.",
      }, 500);
    }

    const senderById = new Map(
      (senders || []).map((sender) => [sender.id, sender]),
    );
    const profileById = new Map((profiles || []).map((profile) => [
      profile.user_id,
      profile.display_name,
    ]));
    return context.json({
      messages: visibleMessages.map((message) => {
        const sender = senderById.get(message.sender_id);
        return {
          id: message.id,
          body: message.body,
          created_at: message.created_at,
          edited_at: message.edited_at,
          deleted_at: message.deleted_at,
          delivered_at: message.sender_id === account.id
            ? message.delivered_at
            : null,
          read_at: message.sender_id === account.id ? message.read_at : null,
          sender_public_id: sender?.public_id || null,
          sender_role: sender?.role || null,
          sender_display_name: sender?.account_type === "anonymous"
            ? sender.public_id
            : profileById.get(message.sender_id) || sender?.public_id || null,
        };
      }),
    });
  },
);

app.post(
  "/conversations/:publicId/messages",
  requireAccount,
  async (context) => {
    const account = context.get("account");
    const body = (await context.req.json().catch(() => null)) as
      | { body?: unknown }
      | null;
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (text.length < 1 || text.length > 4000) {
      return context.json({ error: "Check the submitted message." }, 400);
    }

    const { data, error } = await admin.rpc("sc_send_conversation_message", {
      p_actor_id: account.id,
      p_conversation_public_id: context.req.param("publicId"),
      p_body: text,
    });
    if (error) {
      console.error("Supabase message creation failed:", error.message);
      return context.json(
        { error: "The message could not be sent right now." },
        500,
      );
    }
    const result = data as {
      error?: string;
      message?: Record<string, unknown>;
    };
    if (result.error === "not_found") {
      return context.json(
        { error: "The requested record was not found." },
        404,
      );
    }
    if (result.error === "closed") {
      return context.json({ error: "This conversation is closed." }, 409);
    }
    if (!result.message) {
      console.error("Supabase message creation returned an invalid result.");
      return context.json(
        { error: "The message could not be sent right now." },
        500,
      );
    }
    return context.json({ message: result.message }, 201);
  },
);

app.post(
  "/conversations/:publicId/receipts",
  requireAccount,
  async (context) => {
    const account = context.get("account");
    const body = (await context.req.json().catch(() => null)) as
      | { messageIds?: unknown; state?: unknown }
      | null;
    if (
      !Array.isArray(body?.messageIds) ||
      body.messageIds.length < 1 ||
      body.messageIds.length > 100 ||
      body.messageIds.some((id) =>
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          .test(id)
      ) ||
      !["delivered", "read"].includes(String(body.state))
    ) {
      return context.json({
        error: "Check the submitted receipt information.",
      }, 400);
    }

    const { data, error } = await admin.rpc("sc_update_message_receipts", {
      p_actor_id: account.id,
      p_conversation_public_id: context.req.param("publicId"),
      p_message_ids: body.messageIds,
      p_state: body.state,
    });
    if (error) {
      console.error("Supabase message receipt update failed:", error.message);
      return context.json({
        error: "Message receipts could not be updated.",
      }, 500);
    }
    const result = data as { error?: string; updated?: number };
    if (result.error === "not_found") {
      return context.json(
        { error: "The requested record was not found." },
        404,
      );
    }
    if (result.error === "invalid_input") {
      return context.json({
        error: "Check the submitted receipt information.",
      }, 400);
    }
    if (typeof result.updated !== "number") {
      console.error("Supabase receipt update returned an invalid result.");
      return context.json({
        error: "Message receipts could not be updated.",
      }, 500);
    }
    return context.json({ updated: result.updated });
  },
);

if (import.meta.main) {
  Deno.serve(app.fetch);
}
