import { taskManager } from "../home";

export function filterIssues(
  textBox: HTMLInputElement,
  issuesContainer: HTMLDivElement
) {
    const filterText = textBox.value.toLowerCase();
    const issues = Array.from(issuesContainer.children) as HTMLDivElement[];
    // Get issue IDs and search results
    const issueIds = issues
      .map((issue) => issue.children[0].getAttribute("data-issue-id"))
      .filter((id): id is string => id !== null)
      .map((id) => parseInt(id));

    const searchResults = taskManager.issueSearcher.search(filterText, issueIds);
    // If there's a search term, sort by relevance
    if (filterText) {
      issues
        .sort((a, b) => {
          const scoreA = parseFloat(a.getAttribute("data-relevance-score") || "0");
          const scoreB = parseFloat(b.getAttribute("data-relevance-score") || "0");
          return scoreB - scoreA; // Sort in descending order of relevance score
        })
        .forEach((issue) => {
          issue.classList.add("active");
          const issueId = issue.children[0].getAttribute("data-issue-id");
          if (!issueId) return;
          const result = searchResults.get(parseInt(issueId));
          if (!result) return;
          issue.style.display = result.visible ? "block" : "none";
          if (result.score !== undefined) {
            issue.setAttribute("data-relevance-score", result.score.toFixed(3));
          }
        });
    }
};
