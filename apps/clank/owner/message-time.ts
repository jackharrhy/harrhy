export function localizeMessageTime(node: HTMLTimeElement) {
  const date = new Date(node.dateTime);
  const clock = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  node.textContent =
    date.toDateString() === new Date().toDateString()
      ? clock
      : date.toLocaleDateString([], { day: "numeric", month: "short" }) +
        " " +
        clock;
  node.title = date.toLocaleString();
}
