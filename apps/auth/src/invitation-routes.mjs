const fail = (status, message) => Object.assign(new Error(message), { status });

export function createInvitationRoute({
  ledger,
  issuer,
  organizationId,
  provisioningApi,
  loginApi,
  emailActions,
  rateLimit,
  renderEmailForm,
  renderEmailResult,
}) {
  return async ({
    request,
    url,
    form,
    session,
    context,
    redirect,
    sendRemix,
  }) => {
    if (!provisioningApi)
      throw fail(503, "Identity invitations are not configured.");
    if (request.method === "GET") {
      if (url.searchParams.size) {
        const subject = url.searchParams.get("userID");
        const code = url.searchParams.get("code");
        if (
          !/^[a-f0-9-]{36}$/.test(subject || "") ||
          !code ||
          code.length > 2000 ||
          url.searchParams.get("orgID") !== organizationId
        )
          throw fail(400, "This invitation link is invalid.");
        // Browser session is memory-only. GET neither verifies proof nor changes the issuer.
        session.identityInvitation = {
          subject,
          code,
          expires: Date.now() + 600000,
        };
        redirect("/invitation");
        return;
      }
      if (
        !session.identityInvitation ||
        session.identityInvitation.expires < Date.now()
      ) {
        delete session.identityInvitation;
        throw fail(
          400,
          "Open a current invitation email to set up your account.",
        );
      }
      const passwordPolicy = await emailActions.passwordPolicy();
      await sendRemix((nonce) =>
        renderEmailForm(
          "invitation",
          {
            ...context,
            passwordPolicy,
          },
          nonce,
        ),
      );
      return;
    }
    if (request.method !== "POST") throw fail(405, "Method not allowed.");
    const pending = session.identityInvitation;
    if (!pending || pending.expires < Date.now()) {
      delete session.identityInvitation;
      throw fail(
        400,
        "Open a current invitation email to set up your account.",
      );
    }
    rateLimit(`invitation:${pending.subject}`);
    rateLimit("invitation-total", 100);
    const policy = await emailActions.passwordPolicy();
    const password = form.get("password");
    const valid =
      typeof password === "string" &&
      password.length >= policy.minLength &&
      password.length <= 200 &&
      (!policy.hasUppercase || /[A-Z]/.test(password)) &&
      (!policy.hasLowercase || /[a-z]/.test(password)) &&
      (!policy.hasNumber || /[0-9]/.test(password)) &&
      (!policy.hasSymbol || /[^A-Za-z0-9]/.test(password));
    if (!valid || password !== form.get("confirmation")) {
      await sendRemix(
        (nonce) =>
          renderEmailForm(
            "invitation",
            {
              ...context,
              passwordPolicy: policy,
              error: valid
                ? "The passwords do not match."
                : "Check the password requirements below.",
            },
            nonce,
          ),
        400,
      );
      return;
    }
    // Consume the browser binding before effects. Ambiguous native outcomes cannot be replayed.
    delete session.identityInvitation;
    try {
      await ledger.completeInvitation({
        subject: pending.subject,
        code: pending.code,
        organizationId,
        issuer,
        password,
        validatePassword: async () => {
          if (!valid) throw fail(400, "Check password.");
        },
        loginApi,
        provisioningApi,
      });
    } catch (error) {
      if (error?.onboardingUncertain !== true) throw error;
      await sendRemix(
        (nonce) =>
          renderEmailResult(
            "Account setup needs review",
            "The setup outcome is uncertain. Do not repeat this invitation. Ask your administrator to review the exact account; use password recovery if a password may already have been set.",
            { csrf: context.csrf },
            nonce,
          ),
        502,
      );
      return;
    }
    await sendRemix((nonce) =>
      renderEmailResult(
        "Account ready",
        "Your password is set. Sign in to continue. Service access is assigned separately.",
        { csrf: context.csrf },
        nonce,
      ),
    );
  };
}
