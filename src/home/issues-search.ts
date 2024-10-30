import { GitHubIssue } from "./github-types";
import { TaskManager } from "./task-manager";
import { SearchResult, SearchWeights, SearchConfig } from "./types/search-types";
import { VectorSearch } from "./search/vector-search";
import { SearchScorer } from "./search/search-scorer";

export class IssueSearch {
  private readonly _weights: SearchWeights = {
    title: 0.3,
    body: 0.2,
    fuzzy: 0.2,
    meta: 0.1,
    vector: 0.2
  };
  
  private readonly _config: SearchConfig = {
    fuzzySearchThreshold: 0.7,
    exactMatchBonus: 1.0,
    fuzzyMatchWeight: 0.7
  };

  private readonly _vectorSearch: VectorSearch;
  private readonly _searchScorer: SearchScorer;

  constructor(private _taskManager: TaskManager) {
    this._vectorSearch = new VectorSearch();
    this._searchScorer = new SearchScorer(this._config);
  }

  public async initializeVectors(issues: GitHubIssue[]) {
    const documents = issues.map(issue => ({
      id: issue.id,
      content: this._getSearchableContent(issue)
    }));
    await this._vectorSearch.initializeVectors(documents);
  }

  public search(searchText: string, issueIds: number[]): Map<number, SearchResult> {
    const filterText = searchText.toLowerCase().trim();
    const results = new Map<number, SearchResult>();

    if (!filterText) {
      issueIds.forEach(id => results.set(id, this._createEmptyResult()));
      return results;
    }

    const searchTerms = this._preprocessSearchTerms(filterText);

    issueIds.forEach(async issueId => {
      const issue = this._taskManager.getGitHubIssueById(issueId);
      if (!issue) {
        results.set(issueId, this._createEmptyResult(false));
        return;
      }

      const result = await this._calculateIssueRelevance(issue, searchTerms);
      results.set(issueId, result);
    });

    this._calculateNDCGScore(results);
    return results;
  }

  private async _calculateIssueRelevance(
    issue: GitHubIssue,
    searchTerms: string[]
  ): Promise<SearchResult> {
    const matchDetails = {
      titleMatches: [] as string[],
      bodyMatches: [] as string[],
      labelMatches: [] as string[],
      numberMatch: false,
      similarityScore: 0,
      fuzzyMatches: [] as Array<{
        original: string;
        matched: string;
        score: number;
      }>
    };

    const searchableContent = this._getSearchableContent(issue);

    // Calculate individual scores
    const scores = {
      title: this._searchScorer.calculateTitleScore(issue, searchTerms, matchDetails),
      body: this._searchScorer.calculateBodyScore(issue, searchTerms, matchDetails),
      fuzzy: this._searchScorer.calculateFuzzyScore(searchableContent, searchTerms, matchDetails),
      meta: this._searchScorer.calculateMetaScore(issue, searchTerms, matchDetails),
      vector: await this._vectorSearch.getSimilarityScore(issue.id, searchTerms)
    };

    matchDetails.similarityScore = scores.vector;

    // Calculate weighted total score
    const totalScore = Object.entries(scores).reduce((total, [key, score]) => {
      return total + score * this._weights[key as keyof SearchWeights];
    }, 0);

    const isVisible = totalScore > 0 || matchDetails.numberMatch;

    return {
      visible: isVisible,
      score: isVisible ? totalScore : 0,
      matchDetails
    };
  }

  private _calculateNDCGScore(results: Map<number, SearchResult>): number {
    const scores = Array.from(results.values())
      .filter(r => r.visible)
      .map(r => r.score)
      .sort((a, b) => b - a);

    if (scores.length === 0) return 0;

    const dcg = scores.reduce((sum, score, index) => {
      return sum + (Math.pow(2, score) - 1) / Math.log2(index + 2);
    }, 0);

    const idcg = [...scores]
      .sort((a, b) => b - a)
      .reduce((sum, score, index) => {
        return sum + (Math.pow(2, score) - 1) / Math.log2(index + 2);
      }, 0);

    return idcg === 0 ? 0 : dcg / idcg;
  }

  private _preprocessSearchTerms(searchText: string): string[] {
    return searchText
      .split(/\s+/)
      .filter(Boolean)
      .map(term => term.toLowerCase());
  }

  private _getSearchableContent(issue: GitHubIssue): string {
    return `${issue.title} ${issue.body || ''} ${
      issue.labels?.map(l => typeof l === 'object' && l.name ? l.name : '').join(' ') || ''
    }`.toLowerCase();
  }

  private _createEmptyResult(visible: boolean = true): SearchResult {
    return {
      visible,
      score: visible ? 1 : 0,
      matchDetails: {
        titleMatches: [],
        bodyMatches: [],
        labelMatches: [],
        numberMatch: false,
        similarityScore: 0,
        fuzzyMatches: []
      }
    };
  }
}
