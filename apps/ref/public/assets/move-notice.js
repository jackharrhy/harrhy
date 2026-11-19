const notice = document.querySelector("[data-move-notice]");
const dismiss = notice?.querySelector("[data-dismiss-move-notice]");
if (dismiss) {
  dismiss.hidden = false;
  dismiss.addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.delete("moved");
    history.replaceState(history.state, "", url);
    notice.hidden = true;
  });
}
