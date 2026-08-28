/**
 * Generates assets/stats-<theme>.svg from the GitHub GraphQL API.
 *
 * Run by .github/workflows/refresh.yml on a daily cron, so the card in the README is
 * always current AND always served from this repo — no third-party endpoint that can
 * rate-limit, 503, or shut down (which is exactly what killed the previous cards).
 *
 *   GITHUB_TOKEN=... node scripts/build-stats.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const USER  = process.env.GH_USER || 'codewithmashi';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('GITHUB_TOKEN required'); process.exit(1); }

const QUERY = `query($login:String!){
  user(login:$login){
    createdAt
    followers{totalCount}
    following{totalCount}
    repositories(first:100,ownerAffiliations:OWNER,isFork:false,orderBy:{field:STARGAZERS,direction:DESC}){
      totalCount
      nodes{ stargazerCount forkCount primaryLanguage{name color} }
    }
    contributionsCollection{
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      contributionCalendar{ totalContributions }
    }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method:'POST',
  headers:{ Authorization:`bearer ${TOKEN}`, 'Content-Type':'application/json' },
  body: JSON.stringify({ query: QUERY, variables:{ login: USER } }),
});
if (!res.ok) { console.error('GitHub API', res.status, await res.text()); process.exit(1); }
const { data, errors } = await res.json();
if (errors) { console.error(JSON.stringify(errors)); process.exit(1); }

const u     = data.user;
const repos = u.repositories.nodes;
const stars = repos.reduce((n,r)=>n+r.stargazerCount,0);
const forks = repos.reduce((n,r)=>n+r.forkCount,0);
const c     = u.contributionsCollection;

// language mix, weighted by repo count
const langs = {};
for (const r of repos) if (r.primaryLanguage) {
  const { name, color } = r.primaryLanguage;
  langs[name] ??= { n:0, color: color || '#8b949e' };
  langs[name].n++;
}
const top = Object.entries(langs).sort((a,b)=>b[1].n-a[1].n).slice(0,6);
const totalLang = top.reduce((n,[,v])=>n+v.n,0) || 1;

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const W = 840, H = 232;
const MEMBER_SINCE = new Date(u.createdAt).getFullYear();

function card({ bg, panel, fg, dim, accent, border }) {
  // Deliberately NOT a commit/contribution counter. The GitHub API attributes only a
  // handful of commits to this account (restrictedContributionsCount is 0), so those
  // numbers would wildly understate the actual output. Language mix is accurate
  // regardless of commit attribution, and says more about the work anyway.
  const barW = W - 76, barY = 96;
  let off = 0;
  const bar = top.map(([, v]) => {
    const w = (v.n / totalLang) * barW;
    const seg = `<rect x="${38 + off}" y="${barY}" width="${Math.max(w - 3, 3)}" height="14" rx="7" fill="${v.color}">` +
      `<animate attributeName="opacity" values="0.25;1" dur="0.6s" begin="${0.07 * top.indexOf(top.find(t => t[1] === v))}s" fill="freeze"/></rect>`;
    off += w; return seg;
  }).join('');

  const legend = top.map(([name, v], i) => {
    const x = 38 + (i % 3) * 258, y = barY + 56 + Math.floor(i / 3) * 34;
    const pct = Math.round((v.n / totalLang) * 100);
    return `<g>
      <circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${v.color}"/>
      <text x="${x + 18}" y="${y}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12.5" fill="${fg}">${esc(name)}</text>
      <text x="${x + 18 + esc(name).length * 7.6 + 8}" y="${y}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="11.5" fill="${dim}">${pct}%</text>
    </g>`;
  }).join('');

  const meta = `${u.repositories.totalCount} public repos · building since ${MEMBER_SINCE}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Language mix across ${USER}'s public repositories">
<rect width="${W}" height="${H}" rx="14" fill="${bg}" stroke="${border}"/>
<text x="38" y="48" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="18" font-weight="700" fill="${fg}">What I build in</text>
<text x="38" y="70" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="10.5" letter-spacing="1.2" fill="${dim}">${esc(meta.toUpperCase())}</text>
<circle cx="${W - 40}" cy="44" r="4" fill="${accent}"><animate attributeName="opacity" values="1;0.25;1" dur="2.4s" repeatCount="indefinite"/></circle>
<rect x="38" y="${barY}" width="${barW}" height="14" rx="7" fill="${panel}"/>
${bar}${legend}
</svg>`;
}

mkdirSync('assets', { recursive:true });
writeFileSync('assets/stats-dark.svg',  card({ bg:'#0d1117', panel:'#21262d', fg:'#e6edf3', dim:'#7d8590', accent:'#22d3ee', border:'#21262d' }));
writeFileSync('assets/stats-light.svg', card({ bg:'#ffffff', panel:'#eaeef2', fg:'#1f2328', dim:'#59636e', accent:'#0891b2', border:'#d1d9e0' }));
console.log(`langs=${top.map(([n,v])=>n+':'+Math.round(v.n/totalLang*100)+'%').join(' ')} repos=${u.repositories.totalCount}`);
