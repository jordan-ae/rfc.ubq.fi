import { GitHubIssue } from "../github-types";
import { SearchConfig, SearchResult } from "../types/search-types";
import { StringSimilarity } from "./string-similarity";

export class SearchScorer {
    constructor(private _config: SearchConfig) {}

    public calculateTitleScore(
        issue: GitHubIssue,
        searchTerms: string[],
        matchDetails: SearchResult['matchDetails']
    ): number {
        let score = 0;
        const title = issue.title.toLowerCase();

        searchTerms.forEach(term => {
            if (title.includes(term)) {
                matchDetails.titleMatches.push(term);
                score += this._config.exactMatchBonus;
                if (title.startsWith(term)) {
                    score += 0.5;
                }
            }
        });

        if (searchTerms.length > 1 && title.includes(searchTerms.join(' '))) {
            score += 1;
        }
        return Math.min(score, 3);
    }

    public calculateBodyScore(
        issue: GitHubIssue,
        searchTerms: string[],
        matchDetails: SearchResult['matchDetails']
    ): number {
        let score = 0;
        const body = (issue.body || '').toLowerCase();

        searchTerms.forEach(term => {
            const matches = body.match(new RegExp(term, 'gi')) || [];
            if (matches.length > 0) {
                matchDetails.bodyMatches.push(term);
                score += Math.min(matches.length / 2, 1);
            }
            const codeBlockMatches = body.match(/```[\s\S]*?```/g) || [];
            codeBlockMatches.forEach(block => {
                if (block.toLowerCase().includes(term)) {
                    score += 0.5;
                }
            });
        });
        return Math.min(score, 2);
    }

    public calculateMetaScore(
        issue: GitHubIssue,
        searchTerms: string[],
        matchDetails: SearchResult['matchDetails']
    ): number {
        let score = 0;
        const numberTerm = searchTerms.find(term => /^\d+$/.test(term));
        if (numberTerm && issue.number.toString() === numberTerm) {
            matchDetails.numberMatch = true;
            score += 2;
        }
        if (issue.labels) {
            searchTerms.forEach(term => {
                issue.labels?.forEach(label => {
                    if (typeof label === 'object' && label.name && label.name.toLowerCase().includes(term)) {
                        matchDetails.labelMatches.push(label.name);
                        score += 0.5;
                    }
                });
            });
        }

        return score;
    }

    public calculateFuzzyScore(
        content: string,
        searchTerms: string[],
        matchDetails: SearchResult['matchDetails']
    ): number {
        let score = 0;
        const contentWords = this._tokenizeContent(content);
        searchTerms.forEach(searchTerm => {
            let bestMatch = {
                word: '',
                score: 0
            };
            contentWords.forEach(word => {
                const similarity = StringSimilarity.calculate(searchTerm, word);
                if (similarity > this._config.fuzzySearchThreshold && similarity > bestMatch.score) {
                    bestMatch = { word, score: similarity };
                }
            });
            if (bestMatch.score > 0) {
                matchDetails.fuzzyMatches.push({
                    original: searchTerm,
                    matched: bestMatch.word,
                    score: bestMatch.score
                });
                score += bestMatch.score * this._config.fuzzyMatchWeight;
            }
        });

        return Math.min(score, 2);
    }

    private _tokenizeContent(content: string): string[] {
        return content
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2);
    }
}
