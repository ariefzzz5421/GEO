// Page type is a sampling heuristic; prioritize the actual page's JSON-LD.
const order = ["category", "article", "product", "other"];
const articles = new Set(["Article", "BlogPosting", "NewsArticle", "TechArticle", "HowTo"]);
const categories = new Set(["CollectionPage", "ItemList", "SearchResultsPage"]);

export function classifyPage(input, { jsonLdTypes = [], title = "", h1 = "" } = {}) {
  const schemaTypes = new Set(jsonLdTypes);
  if (schemaTypes.has("Product")) return "product";
  if ([...schemaTypes].some((type) => articles.has(type))) return "article";
  if ([...schemaTypes].some((type) => categories.has(type))) return "category";

  const path = new URL(input).pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (/\/(produk|product|products|items?)\/[^/]+/.test(path)) return "product";
  if (/\/(artikel|blog|articles|guides?|news)\/[^/]+/.test(path)) return "article";
  if (/(^|\/)(katalog|catalog|category|categories|collections?|shop|artikel|blog|articles|guides?|news|power-miniatur|amplifier-rakitan|crossover-aktif)$/.test(path)) return "category";
  const heading = (title + " " + h1).toLowerCase();
  if (/\b(katalog|kategori|koleksi)\b/.test(heading) && path !== "/") return "category";
  return "other";
}

// We only know URL hints before fetching a candidate; actual classification
// is recalculated from the fetched schema/title and reflected in pageTypes.
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
