import React, { useEffect, useMemo, useState } from "react";
import { HiOutlineSearch } from "react-icons/hi";
import { FiStar, FiCode } from "react-icons/fi";
import dayjs from "dayjs";

// Safe token getter (works in Vite or Node envs)
function getGithubToken() {
  let token = null;
  try {
    if (typeof import.meta !== "undefined" && typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_GH_TOKEN) {
      token = import.meta.env.VITE_GH_TOKEN;
    }
  } catch (e) {}
  try {
    if (!token && typeof process !== "undefined" && process.env && process.env.VITE_GH_TOKEN) {
      token = process.env.VITE_GH_TOKEN;
    }
  } catch (e) {}
  return token;
}
const GITHUB_TOKEN = getGithubToken();

async function ghFetch(endpoint) {
  const headers = { Accept: "application/vnd.github.v3+json" };
  if (GITHUB_TOKEN) headers.Authorization = `token ${GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${endpoint}`, { headers });
  if (!res.ok) {
    const txt = await res.text().catch(()=>'');
    throw new Error(`GitHub API error ${res.status} ${txt}`);
  }
  return res.json();
}

function useDebounce(value, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function sparkPath(values, w=200, h=40) {
  if(!values || values.length===0) return '';
  const max = Math.max(...values,1);
  const min = Math.min(...values,0);
  const len = values.length;
  const step = w / Math.max(len-1,1);
  const points = values.map((v,i) => {
    const x = i*step;
    const y = h - ((v - min)/(max - min + 1e-6))*h;
    return `${x},${y}`;
  });
  return 'M' + points.join(' L ');
}

export default function GitAnalyzer(){
  const [query,setQuery] = useState('vercel');
  const debounced = useDebounce(query,450);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  const [profile,setProfile]=useState(null);
  const [repos,setRepos]=useState([]);
  const [page,setPage]=useState(1);
  const perPage=12;
  const [sortBy,setSortBy]=useState('stars');
  const [filterLang,setFilterLang]=useState('All');
  const [selectedRepo,setSelectedRepo]=useState(null);

  useEffect(()=>{ if(!debounced) return; (async ()=>{
    setLoading(true); setError(null); setProfile(null); setRepos([]); setSelectedRepo(null); setPage(1);
    try{
      const p = await ghFetch(`/users/${encodeURIComponent(debounced)}`);
      setProfile(p);
      const list = await ghFetch(`/users/${debounced}/repos?per_page=100&type=owner&sort=pushed`);
      setRepos(list.map(r=>({ id:r.id, name:r.name, full_name:r.full_name, description:r.description, language:r.language, stargazers_count:r.stargazers_count, pushed_at:r.pushed_at, size:r.size, html_url:r.html_url, owner:r.owner?.login })));
    }catch(e){
      try{
        const o = await ghFetch(`/orgs/${encodeURIComponent(debounced)}`);
        setProfile(o);
        const list = await ghFetch(`/orgs/${debounced}/repos?per_page=100&type=all`);
        setRepos(list.map(r=>({ id:r.id, name:r.name, full_name:r.full_name, description:r.description, language:r.language, stargazers_count:r.stargazers_count, pushed_at:r.pushed_at, size:r.size, html_url:r.html_url, owner:r.owner?.login })));
      }catch(e2){
        setError(e2.message||e.message||'Unknown error');
      }
    }finally{ setLoading(false); }
  })(); },[debounced]);

  const languages = useMemo(()=>{
    const m=new Map(); repos.forEach(r=>{ const l=r.language||'Unknown'; m.set(l,(m.get(l)||0)+1);}); return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]);
  },[repos]);

  const filtered = useMemo(()=>{
    let out=[...repos]; if(filterLang!=='All') out=out.filter(r=> (r.language||'Unknown')===filterLang);
    if(sortBy==='stars') out.sort((a,b)=> (b.stargazers_count||0)-(a.stargazers_count||0));
    if(sortBy==='updated') out.sort((a,b)=> new Date(b.pushed_at)-new Date(a.pushed_at));
    if(sortBy==='size') out.sort((a,b)=> (b.size||0)-(a.size||0));
    return out;
  },[repos,filterLang,sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length/perPage));
  const visible = filtered.slice((page-1)*perPage, page*perPage);

  async function openRepoDetails(repo){
    setSelectedRepo({loading:true, repo});
    try{
      const lang = await ghFetch(`/repos/${repo.full_name}/languages`);
      const contributors = await ghFetch(`/repos/${repo.full_name}/contributors?per_page=6`);
      const commits = await ghFetch(`/repos/${repo.full_name}/commits?per_page=10`);
      const commitCounts = commits.map(c=>({ sha:c.sha, message:c.commit?.message, author:c.author?.login||c.commit?.author?.name||'unknown', date:c.commit?.author?.date, html_url:c.html_url }));
      setSelectedRepo({loading:false, repo, languages:lang, contributors, commits:commitCounts});
    }catch(e){ setSelectedRepo({loading:false, repo, error:e.message}); }
  }

  return (
    <div className="container">
      <header className="header">
        <h1 style={{display:'flex',alignItems:'center',gap:12}}><FiCode /> <span style={{fontWeight:800}}>GitAnalyzer</span></h1>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button style={{padding:'8px 12px',borderRadius:8}}>Theme</button>
          <a href="https://github.com" target="_blank" rel="noreferrer" style={{padding:'8px 12px',background:'#6366f1',color:'#fff',borderRadius:8,textDecoration:'none'}}>Demo on GitHub</a>
        </div>
      </header>

      <div className="grid">
        <aside className="card">
          <div style={{display:'flex',gap:8}}>
            <input type="text" value={query} onChange={e=>setQuery(e.target.value)} placeholder="username or org (e.g. vercel)" />
            <button onClick={()=>setQuery(query.trim())} title="Search"><HiOutlineSearch /></button>
          </div>

          <div style={{marginTop:12}}>
            {loading && <div className="muted">Loading...</div>}
            {error && <div style={{color:'#ef4444'}}>{error}</div>}
            {profile && (
              <div style={{marginTop:12}}>
                <div style={{display:'flex',gap:12,alignItems:'center'}}>
                  <img src={profile.avatar_url} alt="avatar" style={{width:56,height:56,borderRadius:999}} />
                  <div>
                    <div style={{fontWeight:700}}>{profile.name||profile.login}</div>
                    <div className="muted">{profile.bio}</div>
                    <div className="muted" style={{marginTop:8}}>{profile.location}</div>
                  </div>
                </div>

                <div style={{marginTop:12,display:'flex',gap:8}}>
                  <div style={{padding:8,background:'#f9fafb',borderRadius:8,textAlign:'center'}}>
                    <div style={{fontWeight:700}}>{profile.public_repos}</div>
                    <div className="muted">Repos</div>
                  </div>
                  <div style={{padding:8,background:'#f9fafb',borderRadius:8,textAlign:'center'}}>
                    <div style={{fontWeight:700}}>{profile.followers}</div>
                    <div className="muted">Followers</div>
                  </div>
                </div>

                <div style={{marginTop:12}}>
                  <strong>Languages</strong>
                  <div style={{marginTop:8,display:'flex',gap:8,flexWrap:'wrap'}}>
                    <button onClick={()=>setFilterLang('All')} style={{padding:'6px 8px',borderRadius:8}}>All</button>
                    {languages.slice(0,8).map(([l,c])=>(<button key={l} onClick={()=>setFilterLang(l)} style={{padding:'6px 8px',borderRadius:8}}>{l} <small className='muted'>({c})</small></button>))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{marginTop:12}}>
            <label className='muted'>Sort</label>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{marginTop:8,padding:8,borderRadius:8,border:'1px solid #e5e7eb'}}>
              <option value="stars">Stars</option>
              <option value="updated">Last updated</option>
              <option value="size">Size</option>
            </select>
          </div>
        </aside>

        <main>
          <section className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <strong>Repositories</strong>
                <div className='muted'>{repos.length} repositories</div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <div className='muted'>Page {page} / {totalPages}</div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setPage(p=>Math.max(1,p-1))} style={{padding:'6px 10px'}}>Prev</button>
                  <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} style={{padding:'6px 10px'}}>Next</button>
                </div>
              </div>
            </div>

            <div className="repo-grid">
              {visible.map(r=>(
                <article key={r.id} className="repo">
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <div>
                      <a href={r.html_url} target="_blank" rel="noreferrer" style={{fontWeight:700}}>{r.name}</a>
                      <div className="muted" style={{marginTop:6}}>{r.description}</div>
                    </div>
                    <div style={{textAlign:'right'}}><FiStar /> {r.stargazers_count||0}<div className="muted">{r.language||'—'}</div></div>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:8,fontSize:12,color:'#6b7280'}}>
                    <div>Updated {r.pushed_at?dayjs(r.pushed_at).format('YYYY-MM-DD'):'—'}</div>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={()=>openRepoDetails(r)} style={{padding:'6px 8px'}}>Details</button>
                      <a href={r.html_url} target="_blank" rel="noreferrer" style={{padding:'6px 8px',border:'1px solid #e5e7eb',borderRadius:8}}>Visit</a>
                    </div>
                  </div>
                  <div style={{height:60,marginTop:8}}>
                    <svg width="100%" height="60" viewBox="0 0 200 40" preserveAspectRatio="none">
                      <path d={sparkPath(new Array(8).fill(0).map((_,i)=>Math.round(Math.abs(Math.sin(i+(r.stargazers_count||0)))*10)))} fill="none" stroke="#8884d8" strokeWidth="2" strokeOpacity="0.9" />
                    </svg>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {selectedRepo && (
            <section className="card" style={{marginTop:12}}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <div><strong>{selectedRepo.repo.name}</strong><div className='muted'>{selectedRepo.repo.full_name}</div></div>
                <div className='muted'>{selectedRepo.loading?'Loading...':'Details'}</div>
              </div>
              {!selectedRepo.loading && selectedRepo.languages && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 240px',gap:12,marginTop:12}}>
                  <div>
                    <h4 style={{margin:0}}>Top contributors</h4>
                    <div style={{display:'flex',gap:8,marginTop:8}}>
                      {selectedRepo.contributors?.map(c=>(
                        <a key={c.id} href={c.html_url} target="_blank" rel="noreferrer" style={{display:'flex',gap:8,alignItems:'center',padding:8,border:'1px solid #e5e7eb',borderRadius:8}}>
                          <img src={c.avatar_url} alt={c.login} style={{width:36,height:36,borderRadius:999}} />
                          <div style={{fontSize:13}}>{c.login}<div className='muted'>{c.contributions} commits</div></div>
                        </a>
                      ))}
                    </div>
                    <h4 style={{marginTop:12}}>Recent commits</h4>
                    <ul style={{marginTop:8}}>
                      {selectedRepo.commits?.map(c=>(<li key={c.sha} style={{padding:8,border:'1px solid #e5e7eb',borderRadius:8,marginBottom:8}}><div style={{fontWeight:700}}>{c.message?.split('\n')[0]||'No message'}</div><div className='muted'>{c.author} • {c.date?dayjs(c.date).format('YYYY-MM-DD HH:mm'):'—'}</div><a href={c.html_url} target="_blank" rel="noreferrer" style={{fontSize:12}}>View on GitHub</a></li>))}
                    </ul>
                  </div>
                  <aside>
                    <h4 style={{marginTop:0}}>Language breakdown</h4>
                    <div style={{marginTop:8}}>
                      {selectedRepo.languages && Object.entries(selectedRepo.languages).map(([k,v])=>(<div key={k} style={{display:'flex',justifyContent:'space-between'}}><div>{k}</div><div className='muted'>{v} bytes</div></div>))}
                    </div>
                  </aside>
                </div>
              )}
              {selectedRepo.error && <div style={{color:'#ef4444'}}>{selectedRepo.error}</div>}
            </section>
          )}
        </main>
      </div>

      <footer style={{textAlign:'center',marginTop:24}} className='muted'>Built with ❤️ — tweak it and push to GitHub to flex.</footer>
    </div>
  );
}
