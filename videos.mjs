// Nusical: lists the YouTube channel's videos for the Videos tab.
// The API key lives in a Netlify environment variable (YT_KEY), never in the code or on GitHub.
// Netlify's CDN keeps each answer for 10 minutes, so new uploads show up quickly while YouTube is asked
// at most about 150 times a day (well inside the free 10,000-unit quota).

const HANDLE = '@nusical-music';
const API = 'https://www.googleapis.com/youtube/v3/';

async function yt(path, params, key){
  const u = new URL(API + path);
  for(const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('key', key);
  const r = await fetch(u);
  if(!r.ok) throw new Error(`YouTube ${path} ${r.status}`);
  return r.json();
}

async function playlistItems(id, max, key){
  const out = []; let page = '';
  do{
    const j = await yt('playlistItems', {part:'snippet', playlistId:id, maxResults:50, ...(page ? {pageToken:page} : {})}, key);
    for(const it of j.items || []){
      const s = it.snippet, vId = s.resourceId && s.resourceId.videoId;
      if(!vId || /^(Private|Deleted) video$/.test(s.title)) continue;
      const th = s.thumbnails || {};
      out.push({id:vId, title:s.title, date:s.publishedAt, thumb:(th.medium || th.high || th.default || {}).url || '', desc:(s.description || '').slice(0, 1500)});
    }
    page = j.nextPageToken || '';
  } while(page && out.length < max);
  return out;
}

export default async () => {
  const key = process.env.YT_KEY;
  if(!key) return Response.json({error:'YT_KEY is not set'}, {status:500});
  try{
    const ch = await yt('channels', {part:'contentDetails', forHandle:HANDLE}, key);
    const c = (ch.items || [])[0];
    if(!c) throw new Error('channel not found');
    const list = await playlistItems(c.contentDetails.relatedPlaylists.uploads, 500, key);
    // Tags aren't in the playlist listing, so read them 50 videos at a time (1 quota unit per 50).
    for(let i = 0; i < list.length; i += 50){
      const batch = list.slice(i, i + 50);
      const j = await yt('videos', {part:'snippet', id:batch.map(v => v.id).join(','), maxResults:50}, key);
      const tags = Object.fromEntries((j.items || []).map(v => [v.id, (v.snippet.tags || []).join(' ')]));
      for(const v of batch) v.tags = tags[v.id] || '';
    }
    // The channel's playlists become the composer filter (e.g. "Mozart").
    const pl = await yt('playlists', {part:'snippet', channelId:c.id, maxResults:50}, key);
    const composers = [];
    for(const p of (pl.items || []).slice(0, 12)){
      const ids = (await playlistItems(p.id, 200, key)).map(v => v.id);
      if(ids.length) composers.push({name:p.snippet.title, ids});
    }
    return Response.json({list, composers}, {headers:{
      'Cache-Control': 'no-cache',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=60'
    }});
  }catch(e){
    return Response.json({error:String(e.message || e)}, {status:502, headers:{'Cache-Control':'no-store'}});
  }
};

export const config = { path: '/api/videos' };
