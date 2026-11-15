import { directoryFor } from "./directory.mjs";
import { searchAll } from "./applications.mjs";
import { mediaDiscrepancies } from "./media-identities.mjs";

const fail = (status, message) => Object.assign(new Error(message), { status });

export function createAccessRoutes({
  api,
  applications,
  services,
  integrations,
  access,
  native,
  organizationId,
  issuer,
  mediaInventory,
  renderMedia,
  renderMediaReview,
  renderMediaAction,
  accountActions,
  endUserSessions,
  rateLimit,
  supportPreflight,
  renderDirectory,
  renderAppDetail,
  renderSessions,
  renderPeople,
  renderNewPerson,
  renderOnboarding,
  provisioningApi,
  invitationCallbackUrl,
  renderServiceList,
  renderServiceDetail,
  renderIntegrations,
  renderPreviewAccount,
  renderInactivePreview,
  renderActivity,
  renderOperation,
  renderGroups,
  renderGroupForm,
  renderAccessForm,
  renderChangePreview,
  renderPerson,
}) {
  const people = async () =>
    (await searchAll(api, "/management/v1/users/_search")).filter(
      (user) => user.human && user.details?.resourceOwner === organizationId,
    );
  async function handle({
    request,
    url,
    form,
    session,
    profile: _profile,
    context,
    sendRemix,
    redirect,
  }) {
    if (request.method === "GET" && url.pathname === "/account/sessions") {
      const items = await native.sessions(session.userId);
      await sendRemix((nonce) =>
        renderSessions(items, session.sessionId, context, nonce),
      );
      return true;
    }
    if (request.method === "POST" && url.pathname === "/account/sessions/end") {
      await native.endSession(session.userId, form.get("session"));
      redirect(
        form.get("session") === session.sessionId
          ? "/login"
          : "/account/sessions",
      );
      return true;
    }
    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname.startsWith("/apps/"))
    ) {
      const grants = await native.list(session.userId);
      access.observeUnmanaged(grants);
      const items = directoryFor({
        services,
        applications,
        grants,
        subject: session.userId,
        access,
      });
      if (url.pathname === "/")
        await sendRemix((nonce) => renderDirectory(items, context, nonce));
      else {
        const item = items.find(
          (candidate) => url.pathname === `/apps/${candidate.id}`,
        );
        if (!item)
          throw fail(404, "This app is unavailable or not assigned to you.");
        await sendRemix((nonce) => renderAppDetail(item, context, nonce));
      }
      return true;
    }
    if (!url.pathname.startsWith("/manage")) return false;
    if (!context.admin)
      throw fail(403, "Auth administrator membership is required.");
    const preview = url.pathname.match(
      /^\/manage\/people\/([A-Za-z0-9-]{1,200})\/preview(?:\/(account|apps\/[A-Za-z0-9-]{1,200}))?$/,
    );
    if (preview) {
      if (request.method !== "GET") throw fail(403, "Preview is read only.");
      const target = await accountActions.managedUser(preview[1]);
      const base = `/manage/people/${encodeURIComponent(target.id)}/preview`;
      const previewContext = {
        ...context,
        admin: false,
        preview: {
          base,
          name: target.human?.profile?.displayName || target.userName,
          exit: `/manage/people/${encodeURIComponent(target.id)}`,
        },
      };
      if (target.state !== "USER_STATE_ACTIVE")
        await sendRemix((nonce) =>
          renderInactivePreview(target, previewContext, nonce),
        );
      else if (preview[2] === "account")
        await sendRemix((nonce) =>
          renderPreviewAccount(target, previewContext, nonce),
        );
      else {
        const items = directoryFor({
          services,
          applications,
          grants: await native.list(target.id),
          subject: target.id,
          access,
        });
        if (!preview[2])
          await sendRemix((nonce) =>
            renderDirectory(items, previewContext, nonce),
          );
        else {
          const item = items.find(
            (candidate) => preview[2] === `apps/${candidate.id}`,
          );
          if (!item)
            throw fail(404, "This app is unavailable or not assigned.");
          await sendRemix((nonce) =>
            renderAppDetail(item, previewContext, nonce),
          );
        }
      }
      return true;
    }
    if (
      url.pathname === "/manage/media" ||
      url.pathname.startsWith("/manage/media/")
    ) {
      const actionPath = url.pathname.match(
        /^\/manage\/media\/actions\/([a-f0-9-]{36})(?:\/(confirm|recover))?$/,
      );
      if (actionPath) {
        const action = access.mediaActions.get(actionPath[1]);
        if (!action || action.actor !== session.userId)
          throw fail(404, "Service action review not found.");
        if (request.method === "GET" && !actionPath[2]) {
          await sendRemix((nonce) => renderMediaAction(action, context, nonce));
          return true;
        }
        if (request.method === "POST" && actionPath[2]) {
          rateLimit(`media-action:${session.userId}`);
          if (form.get("confirmed") !== "true")
            throw fail(400, "Confirm the reviewed service-specific effect.");
          if (actionPath[2] === "confirm")
            await access.mediaActions.confirm({
              id: action.id,
              actor: session.userId,
              destructiveConfirmation: form.get("destructiveConfirmation"),
            });
          else
            await access.mediaActions.recover({
              id: action.id,
              actor: session.userId,
            });
          redirect(`/manage/media/actions/${action.id}`);
          return true;
        }
        throw fail(404, "Service action not found.");
      }
      if (
        request.method === "POST" &&
        url.pathname === "/manage/media/actions/preview"
      ) {
        rateLimit(`media-action:${session.userId}`);
        const mapping = access.media
          .mappings()
          .find((item) =>
            ["service", "instance", "nativeId", "issuer", "subject"].every(
              (key) => item[key] === form.get(key),
            ),
          );
        if (!mapping)
          throw fail(
            409,
            "An explicitly confirmed exact-ID mapping is required.",
          );
        const action = await access.mediaActions.preview({
          actor: session.userId,
          mapping,
          reason: form.get("reason"),
          operation: form.get("operation"),
        });
        redirect(`/manage/media/actions/${action.id}`);
        return true;
      }
      const identities = async () =>
        (await people()).map((user) => ({
          issuer,
          subject: user.id,
          name: user.human?.profile?.displayName || user.userName || user.id,
          active: user.state === "USER_STATE_ACTIVE",
        }));
      const instances = mediaInventory.instances();
      if (request.method === "GET" && url.pathname === "/manage/media") {
        await sendRemix((nonce) =>
          renderMedia(
            instances,
            undefined,
            undefined,
            [],
            context,
            nonce,
            access.media.reviews(),
            access.mediaActions
              .list()
              .filter((action) => action.actor === session.userId),
          ),
        );
        return true;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/manage/media/confirm"
      ) {
        if (form.get("confirmed") !== "true")
          throw fail(400, "Confirm the exact identity correspondence.");
        const review = access.media.review(form.get("operation"));
        if (!review || review.actor !== session.userId)
          throw fail(404, "Mapping review not found.");
        const { service, instance } = review.body.mapping;
        const result = access.media.confirm({
          id: review.id,
          actor: session.userId,
          inventory: await mediaInventory.read(service, instance),
          people: await identities(),
        });
        await sendRemix((nonce) => renderMediaReview(result, context, nonce));
        return true;
      }
      const audit = url.pathname.match(
        /^\/manage\/media\/reviews\/([A-Za-z0-9-]{1,200})$/,
      );
      if (request.method === "GET" && audit) {
        const review = access.media.review(audit[1]);
        if (!review) throw fail(404, "Mapping review not found.");
        await sendRemix((nonce) => renderMediaReview(review, context, nonce));
        return true;
      }
      const target = url.pathname.match(
        /^\/manage\/media\/([a-z-]+)\/([A-Za-z0-9-]{1,100})(\/preview)?$/,
      );
      const selected =
        target &&
        instances.find(
          (item) => item.service === target[1] && item.instance === target[2],
        );
      if (!selected) throw fail(404, "Media instance not found.");
      const inventory = await mediaInventory.read(
        selected.service,
        selected.instance,
      );
      const current = await identities();
      if (request.method === "GET" && !target[3]) {
        const result = mediaDiscrepancies({
          snapshot: inventory,
          mappings: access.media.mappings(),
          people: current,
        });
        await sendRemix((nonce) =>
          renderMedia(instances, selected, result, current, context, nonce),
        );
        return true;
      }
      if (request.method === "POST" && target[3] === "/preview") {
        rateLimit(`media-link:${session.userId}`);
        const review = access.media.preview({
          actor: session.userId,
          reason: form.get("reason"),
          mapping: {
            service: selected.service,
            instance: selected.instance,
            issuer,
            subject: form.get("subject"),
            nativeId: form.get("nativeId"),
          },
          inventory,
          people: current,
        });
        await sendRemix((nonce) => renderMediaReview(review, context, nonce));
        return true;
      }
      throw fail(404, "Media action not found.");
    }
    if (request.method === "GET" && url.pathname === "/manage/people/new") {
      await sendRemix((nonce) =>
        renderNewPerson(
          { ...context, onboardingEnabled: Boolean(provisioningApi) },
          nonce,
        ),
      );
      return true;
    }
    const onboardingPath = url.pathname.match(
      /^\/manage\/onboarding(?:\/([a-f0-9-]{36})(?:\/(create|invite))?)?$/,
    );
    if (onboardingPath || url.pathname === "/manage/users") {
      if (request.method === "POST" && !provisioningApi)
        throw fail(
          503,
          "Reviewed identity provisioning is not configured. No native action was attempted.",
        );
      if (request.method === "POST" && url.pathname === "/manage/users") {
        rateLimit(`admin-create:${session.userId}`);
        const row = access.onboarding.preview({
          actor: session.userId,
          issuer,
          organizationId,
          username: form.get("username"),
          name: form.get("name"),
          email: form.get("email"),
          reason: form.get("reason"),
        });
        redirect(`/manage/onboarding/${row.id}`);
        return true;
      }
      const id = onboardingPath?.[1];
      if (request.method === "GET" && onboardingPath && !onboardingPath[2]) {
        const row = id ? access.onboarding.get(id) : null;
        if (id && !row) throw fail(404, "Identity review not found.");
        await sendRemix((nonce) =>
          renderOnboarding(
            row,
            access.onboarding.recent(),
            { ...context, onboardingEnabled: Boolean(provisioningApi) },
            nonce,
          ),
        );
        return true;
      }
      if (request.method === "POST" && id && onboardingPath[2]) {
        rateLimit(`onboarding:${session.userId}`);
        const shared = {
          id,
          actor: session.userId,
          issuer,
          organizationId,
          confirmed: form.get("confirmed") === "yes",
          api: provisioningApi,
        };
        if (onboardingPath[2] === "create")
          await access.onboarding.create(shared);
        else
          await access.onboarding.invite({
            ...shared,
            recipient: form.get("recipient"),
            callbackUrl: invitationCallbackUrl,
          });
        redirect(`/manage/onboarding/${id}`);
        return true;
      }
      throw fail(405, "Method not allowed.");
    }
    access.observeUnmanaged(await native.list());
    const model = access.read();
    const domains = access.domains();
    if (request.method === "GET" && url.pathname === "/manage") {
      redirect("/manage/people");
      return true;
    }
    if (request.method === "GET" && url.pathname === "/manage/people") {
      const users = await people();
      const filter = {
        q: (url.searchParams.get("q") || "").slice(0, 200),
        state: url.searchParams.get("state") || "all",
      };
      await sendRemix((nonce) =>
        renderPeople(users, model, context, filter, nonce),
      );
      return true;
    }
    const person = url.pathname.match(
      /^\/manage\/(?:people|users)\/([A-Za-z0-9-]{1,200})(?:\/(access|recovery|status))?$/,
    );
    if (person) {
      const user = await accountActions.managedUser(person[1]);
      if (request.method === "GET") {
        if (person[2] === "access")
          await sendRemix((nonce) =>
            renderAccessForm(user, model, domains, services, context, nonce),
          );
        else {
          const observed = await native.list(user.id);
          const personContext = {
            ...context,
            supportTarget: context.supportEnabled
              ? await supportPreflight?.(context.user, user.id)
              : undefined,
          };
          await sendRemix((nonce) =>
            renderPerson(
              user,
              model,
              domains,
              services,
              observed,
              personContext,
              undefined,
              nonce,
            ),
          );
        }
        return true;
      }
      if (request.method === "POST" && person[2] === "recovery") {
        rateLimit(`admin-recovery:${session.userId}:${user.id}`);
        const recoveryLink = await accountActions.recoveryLink(
          user.id,
          new URL(url).origin,
        );
        access.recordAccount(session.userId, user.id, "recovery.created");
        const observed = await native.list(user.id);
        await sendRemix((nonce) =>
          renderPerson(
            user,
            model,
            domains,
            services,
            observed,
            context,
            recoveryLink,
            nonce,
          ),
        );
        return true;
      }
      if (request.method === "POST" && person[2] === "status") {
        const next = form.get("active");
        if (!["true", "false"].includes(next))
          throw fail(400, "Invalid account state.");
        if (next === "false" && access.isAdministrator(user.id)) {
          const current = await people();
          if (
            model.memberships.filter(
              (item) =>
                item.group === "auth-administrators" &&
                current.some(
                  (candidate) =>
                    candidate.id === item.subject &&
                    candidate.state === "USER_STATE_ACTIVE",
                ),
            ).length <= 1
          )
            throw fail(409, "Keep at least one active Auth administrator.");
        }
        await accountActions.setActive(user.id, next === "true", user.state);
        access.recordAccount(
          session.userId,
          user.id,
          next === "false" ? "account.suspended" : "account.enabled",
        );
        if (next === "false") await endUserSessions(user.id);
        redirect(`/manage/people/${encodeURIComponent(user.id)}`);
        return true;
      }
    }
    if (request.method === "GET" && url.pathname === "/manage/groups") {
      await sendRemix((nonce) => renderGroups(model, context, nonce));
      return true;
    }
    const group = url.pathname.match(
      /^\/manage\/groups\/([A-Za-z0-9-]{1,200})$/,
    );
    if (request.method === "GET" && group) {
      const value =
        group[1] === "new"
          ? null
          : model.groups.find((item) => item.id === group[1]);
      if (group[1] !== "new" && !value) throw fail(404, "Group not found.");
      const users = await people();
      await sendRemix((nonce) =>
        renderGroupForm(value, model, domains, users, context, nonce),
      );
      return true;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/manage/changes/preview"
    ) {
      const change = {
        type: form.get("type"),
        revision: Number(form.get("revision")),
        reason: form.get("reason"),
        subject: form.get("subject"),
        group: form.get("group"),
        name: form.get("name"),
        description: form.get("description"),
        application: form.get("application"),
        roles: form.getAll("roles"),
        bindings: form.getAll("bindings").map((value) => {
          const parts = value.split("|");
          if (parts.length !== 2) throw fail(400, "Invalid group role.");
          return { application: parts[0], role: parts[1] };
        }),
      };
      const current = await people();
      change.groupName = model.groups.find(
        (candidate) => candidate.id === change.group,
      )?.name;
      if (change.subject) {
        const target = current.find((user) => user.id === change.subject);
        if (!target) throw fail(403, "Choose a human in this organization.");
        if (
          (change.type === "membership.add" ||
            (change.type === "direct.set" && change.roles.length)) &&
          target.state !== "USER_STATE_ACTIVE"
        )
          throw fail(409, "Activate this person before adding access.");
        if (
          change.type === "membership.remove" &&
          change.group === "auth-administrators"
        ) {
          const remaining = model.memberships.filter(
            (item) =>
              item.group === "auth-administrators" &&
              item.subject !== change.subject &&
              current.some(
                (user) =>
                  user.id === item.subject &&
                  user.state === "USER_STATE_ACTIVE",
              ),
          );
          if (!remaining.length)
            throw fail(409, "Keep at least one active Auth administrator.");
        }
      }
      const changePreview = await access.preview(change, session.userId);
      await sendRemix((nonce) =>
        renderChangePreview(changePreview, domains, current, context, nonce),
      );
      return true;
    }
    if (request.method === "POST" && url.pathname === "/manage/changes/apply") {
      const operation = access.operation(form.get("operation"));
      if (!operation || operation.actor !== session.userId)
        throw fail(404, "Change preview not found.");
      const target = operation.body.change.subject;
      if (target) {
        const user = await accountActions.managedUser(target);
        const change = operation.body.change;
        if (
          (change.type === "membership.add" ||
            (change.type === "direct.set" && change.roles.length)) &&
          user.state !== "USER_STATE_ACTIVE"
        )
          throw fail(409, "This person is not active. Review again.");
        if (
          change.type === "membership.remove" &&
          change.group === "auth-administrators"
        ) {
          const current = await people();
          if (
            !access
              .read()
              .memberships.some(
                (item) =>
                  item.group === "auth-administrators" &&
                  item.subject !== target &&
                  current.some(
                    (candidate) =>
                      candidate.id === item.subject &&
                      candidate.state === "USER_STATE_ACTIVE",
                  ),
              )
          )
            throw fail(409, "Keep at least one active administrator.");
        }
      }
      const result = await access.apply(operation.id, session.userId);
      redirect(`/manage/operations/${result.id}`);
      return true;
    }
    if (request.method === "GET" && url.pathname === "/manage/activity") {
      await sendRemix((nonce) =>
        renderActivity(access.operations(), context, nonce),
      );
      return true;
    }
    const operation = url.pathname.match(
      /^\/manage\/operations\/([A-Za-z0-9-]{1,200})(\/(?:cleanup|reconcile))?$/,
    );
    if (operation) {
      const value = access.operation(operation[1]);
      if (!value) throw fail(404, "Operation not found.");
      if (request.method === "GET") {
        await sendRemix((nonce) => renderOperation(value, context, nonce));
        return true;
      }
      if (request.method === "POST" && operation[2] === "/reconcile") {
        await access.reconcile(value.id, session.userId);
        redirect(`/manage/operations/${value.id}`);
        return true;
      }
      if (request.method === "POST" && operation[2] === "/cleanup") {
        const index = Number(form.get("index"));
        if (!Number.isInteger(index) || index < 0)
          throw fail(400, "Invalid cleanup task.");
        access.completeCleanup(
          value.id,
          index,
          session.userId,
          form.get("note"),
        );
        redirect(`/manage/operations/${value.id}`);
        return true;
      }
    }
    if (request.method === "GET" && url.pathname === "/manage/services") {
      await sendRemix((nonce) =>
        renderServiceList(services, domains, context, nonce),
      );
      return true;
    }
    if (request.method === "GET" && url.pathname === "/manage/integrations") {
      await sendRemix((nonce) =>
        renderIntegrations(integrations, context, nonce),
      );
      return true;
    }
    const service = url.pathname.match(
      /^\/manage\/services\/([A-Za-z0-9-]{1,200})$/,
    );
    if (request.method === "GET" && service) {
      const value = services.find((item) => item.id === service[1]);
      if (!value) throw fail(404, "Service not found.");
      await sendRemix((nonce) =>
        renderServiceDetail(
          value,
          domains.find((app) => app.id === (value.applicationId || value.id)),
          context,
          nonce,
        ),
      );
      return true;
    }
    throw fail(404, "Administration page not found.");
  }
  let pending = Promise.resolve();
  return function dispatch(input) {
    if (
      input.request.method !== "POST" ||
      !input.url.pathname.startsWith("/manage")
    )
      return handle(input);
    if (!access.isAdministrator(input.session.userId))
      throw fail(403, "Auth administrator membership is required.");
    const result = pending.then(async () => {
      const actor = await accountActions.managedUser(input.session.userId);
      if (
        actor.state !== "USER_STATE_ACTIVE" ||
        !access.isAdministrator(actor.id)
      )
        throw fail(403, "Active Auth administrator membership is required.");
      return handle({ ...input, context: { ...input.context, admin: true } });
    });
    pending = result.catch(() => {});
    return result;
  };
}
