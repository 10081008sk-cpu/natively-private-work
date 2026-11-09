export interface ComplexityResult {
  timeComplexity: string;
  spaceComplexity: string;
  explanation: string;
}

export class ComplexityAnalyzer {
  analyze(code: string, language: string): ComplexityResult {
    console.log(`[ComplexityAnalyzer] Analyzing ${language} code (${code.length} chars)`);

    const lower = code.toLowerCase();

    let timeComplexity = 'O(1)';
    let spaceComplexity = 'O(1)';
    let explanation = '';

    const loopCount = (lower.match(/for\s*\(|while\s*\(|for\s+[\w\d_]+\s+in|\.forEach|\.map|\.filter|\.reduce/g) || []).length;
    const nestedLoops = (lower.match(/for\s*\([^)]*\)\s*\{[^}]*for\s*\(/g) || []).length
      + (lower.match(/for\s+[\w\d_]+\s+in\s+[\w\d_]+\s*\{[^}]*for\s+[\w\d_]+\s+in/g) || []).length;
    const hasRecursion = /\b(function|def)\s+(\w+)[\s\S]*?\b\2\s*\(/.test(code);
    const hasSort = /\b(sort|sorted|array\.sort|arrays\.sort|collections\.sort|std::sort)\s*\(/i.test(lower);
    const hasBinarySearch = /\b(binarysearch|binary_search|bisect)\s*\(/i.test(lower);
    const hasDp = /\b(dp|dp\[|memo|memoize|cache|tabulation)\b/i.test(lower);
    const hasGraph = /\b(graph|bfs|dfs|dijkstra|adjacency|edge|vertex)\b/i.test(lower);
    const hasHashMap = /\b(hashmap|hash_map|unordered_map|map|hashmap|dictionary|dict)\b/i.test(lower);
    const hasStringConcat = /for\s*\([^)]*\)\s*\{[^}]*\+=\s*['"`]/.test(code) || /for\s+[\w\d_]+\s+in[\s\S]*\+=\s*['"`]/.test(code);
    const hasRecursiveDp = hasRecursion && hasDp;

    if (hasRecursiveDp) {
      timeComplexity = hasGraph ? 'O(V + E)' : 'O(n)';
      spaceComplexity = hasGraph ? 'O(V)' : 'O(n)';
      explanation = hasGraph
        ? 'Graph DP: O(V + E) time for processing each vertex and edge once with memoization, O(V) space for memo cache.'
        : 'DP with memoization: O(n) time for n states, each computed once. O(n) space for memo/cache.';
    } else if (nestedLoops > 0) {
      timeComplexity = 'O(n²)';
      spaceComplexity = hasHashMap ? 'O(n)' : 'O(1)';
      explanation = 'Nested loops: O(n²) time for iterating over pairs.';
      if (hasHashMap) explanation += ' O(n) space for hash map.';
    } else if (loopCount >= 2 && hasSort) {
      timeComplexity = 'O(n log n)';
      spaceComplexity = hasHashMap ? 'O(n)' : 'O(log n)';
      explanation = 'Sorting-based: O(n log n) time for sort, O(log n) space for recursion stack (or O(n) for merge sort).';
    } else if (hasSort) {
      timeComplexity = 'O(n log n)';
      spaceComplexity = 'O(log n)';
      explanation = 'Sorting: O(n log n) time, O(log n) space for recursive stack.';
    } else if (hasBinarySearch) {
      timeComplexity = 'O(log n)';
      spaceComplexity = 'O(1)';
      explanation = 'Binary search: O(log n) time by halving the search space each iteration.';
    } else if (hasRecursion) {
      timeComplexity = 'O(2ⁿ)';
      spaceComplexity = 'O(n)';
      explanation = 'Recursive: O(2ⁿ) time due to exponential branching, O(n) space for call stack.';
    } else if (loopCount > 2) {
      timeComplexity = 'O(n)';
      spaceComplexity = hasHashMap ? 'O(n)' : 'O(1)';
      explanation = 'Single pass: O(n) time to traverse input once.';
      if (hasHashMap) explanation += ' O(n) space for hash-based lookup.';
    } else if (loopCount > 0) {
      timeComplexity = hasStringConcat ? 'O(n²)' : 'O(n)';
      spaceComplexity = hasHashMap ? 'O(n)' : 'O(1)';
      if (hasStringConcat) {
        explanation = 'String concatenation in loop: O(n²) time due to immutable string copying.';
      } else {
        explanation = 'Single loop: O(n) time for linear traversal.';
      }
      if (hasHashMap) explanation += ' O(n) space for hash map.';
    } else {
      timeComplexity = 'O(1)';
      spaceComplexity = 'O(1)';
      explanation = 'Constant time operations with no loops or recursion.';
    }

    return { timeComplexity, spaceComplexity, explanation };
  }
}
