// Classification is deliberately heuristic and meant for balanced sampling,
// not a search engine's definition of a page type.
const order = ["category", "article", "product", "other"];
export function classifyPage(input) {
  const path = new URL(input).pathname.toLowerCase();
  if (/\/(artikel|blog|articles|guides?|news)(\/|$)/.test(path)) return "article";
  if (/\/(produk|product|products|item|items)(\/|$)/.test(path)) return "product";
  if (/(^|\/)(katalog|catalog|category|categories|collections?|shop)(\/|$)/.test(path)) return "category";
  return "other";
}
export function chooseNext(queue, counts) {
  if (queue.length === 0) return undefined;
  let bestIndex = 0;
  for (let i = 1; i < queue.length; i++) {
    const candidate = classifyPage(queue[i]);
    const incumbent = classifyPage(queue[bestIndex]);
    const scoreA = counts[candidate] ?? 0;
    const scoreB = counts[incumbent] ?? 0;
    if (scoreA < scoreB || (scoreA === scoreB && order.indexOf(candidate) < order.indexOf(incumbent))) {
      bestIndex = i;
    }
  }
  return queue.splice(bestIndex, 1)[0];
}
